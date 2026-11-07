#!/usr/bin/env python3
"""Voice takes on a timeline, music ducked under speech, tap/hit/bell effects, then loudness normalisation.
usage: build_audio.py <config.json>   (written by `cli.mjs audio`; standard library + ffmpeg only)
Writes the config's out_raw (mix before normalising), out_wav (normalised, stereo 44.1 kHz) and cues (voice timeline JSON)."""
import array, json, math, os, random, subprocess, sys, wave

if len(sys.argv) != 2:
    raise SystemExit("usage: build_audio.py <config.json>  (run it through: node cli.mjs audio <reel>)")
CFG = json.load(open(sys.argv[1], encoding="utf-8"))
SR = 44100
A = CFG["audio_dir"]
FIRST, TAIL = 0.05, CFG.get("tail", 1.25)


def decode(path, af=None):
    s = array.array("h")
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-i", path] + (["-af", af] if af else []) + ["-f", "s16le", "-ac", "1", "-ar", str(SR), "-"]
    s.frombytes(subprocess.check_output(cmd))
    return [x / 32768 for x in s]


def rms(q):
    return math.sqrt(sum(v * v for v in q) / max(1, len(q)))


def take(item):
    """Returns (samples, seconds trimmed from the start of the original take)."""
    if item.get("placeholder"):
        return [0.0] * int(SR * item["duration"]), 0.0
    p = os.path.join(A, item["id"] + ".mp3")
    s = decode(p)
    win = int(SR * 0.01)
    lvl = lambda i: max(map(abs, s[i:i + win])) if s[i:i + win] else 0
    a = 0
    while a < len(s) and lvl(a) < 0.03:
        a += win
    b = len(s)
    while b > a and lvl(b - win) < 0.03:
        b -= win
    if b <= a:  # a take with nothing above the threshold: keep it whole
        a, b = 0, len(s)
    a, b = max(0, a - int(SR * 0.01)), min(len(s), b + int(SR * 0.05))
    out = decode(p, f"atrim=start={a / SR}:end={b / SR},asetpts=N/SR/TB,atempo={item['tempo']},"
                    "acompressor=threshold=-20dB:ratio=3:attack=4:release=70:makeup=2,highpass=f=90")
    f = min(int(SR * 0.012), len(out) // 4)
    for i in range(f):
        out[i] *= i / f
        out[-1 - i] *= i / f
    loud = [v for v in out if abs(v) > 0.01]
    k = 0.2 / max(rms(loud), 1e-6) if loud else 1.0
    return [v * k for v in out], a / SR


takes, cues, t = {}, {}, FIRST
for item in CFG["plan"]:
    s, cut = take(item)
    takes[item["id"]] = s
    t += item["gap"]
    words = json.load(open(os.path.join(A, item["id"] + ".words.json"), encoding="utf-8"))
    tempo = 1.0 if item.get("placeholder") else item["tempo"]
    cues[item["id"]] = {"s": round(t, 3), "e": round(t + len(s) / SR, 3), "text": item["text"],
                        "w": [round(t + max(0, st - cut) / tempo, 3) for _, st in words]}
    t = cues[item["id"]]["e"]
TOTAL = round(t + TAIL, 2)
n = int(TOTAL * SR)

voice, speech = [0.0] * n, [False] * n
for name, c in cues.items():
    o = int(c["s"] * SR)
    for i, v in enumerate(takes[name]):
        if o + i < n:
            voice[o + i] += v
    for i in range(max(0, o - int(0.06 * SR)), min(n, int((c["e"] + 0.05) * SR))):
        speech[i] = True

# Sound effects, synthesised (no sample files): whoosh + boom on "hits", a click on each tap, a bell.
rng = random.Random(3)
fx = [0.0] * n


def add(at, dur, fn, g):
    i0 = int(at * SR)
    for i in range(int(dur * SR)):
        if 0 <= i0 + i < n:
            fx[i0 + i] += g * fn(i / SR)


boom = lambda x: math.sin(2 * math.pi * (42 + 60 * math.exp(-x * 22)) * x) * math.exp(-x * 4)
whoosh = lambda x, d=0.2: rng.uniform(-1, 1) * math.sin(math.pi * min(1, x / d)) ** 2
tap = lambda x: math.sin(2 * math.pi * 1750 * x) * math.exp(-x * 240) + 0.4 * math.sin(2 * math.pi * 3100 * x) * math.exp(-x * 400)
bell = lambda x: (math.sin(2 * math.pi * 1320 * x) + 0.6 * math.sin(2 * math.pi * 1980 * x) + 0.3 * math.sin(2 * math.pi * 2640 * x)) * math.exp(-x * 3.5)


def word_time(line, idx):
    w = cues[line]["w"]
    if not w:
        return cues[line]["s"]
    return w[max(-len(w), min(len(w) - 1, idx))]


TAPS = {k: word_time(i, j) for k, (i, j) in CFG.get("taps", {}).items()}
if CFG.get("sfx", True):
    for k in CFG.get("hits", []):
        add(cues[k]["s"] - 0.12, 0.22, whoosh, 0.10)
        add(cues[k]["s"], 0.9, boom, 0.7)
    for v in TAPS.values():
        add(v, 0.05, tap, 0.5)
    if CFG.get("bell"):
        add(cues[CFG["bell"]]["s"], 1.3, bell, 0.10)

real_voice = any(not it.get("placeholder") for it in CFG["plan"])
if real_voice:
    blocks = [rms(voice[i:i + 882]) for i in range(0, n, 882)]
    sr_v = rms([x for x in blocks if x > 0.01]) or 0.2
else:
    sr_v = 0.2  # fixed reference level when the voice is a silent placeholder

db = lambda x: 10 ** (x / 20)
music = [0.0] * n
if CFG.get("music"):
    bed = decode(CFG["music"])
    if bed:
        while len(bed) < n:
            bed += bed
        bed = bed[:n]
        base = rms(bed) or 1
        up, dn = 1 - math.exp(-1 / (0.12 * SR)), 1 - math.exp(-1 / (0.03 * SR))
        hi, lo = db(CFG.get("music_db", -5)), db(CFG.get("duck_db", -17))
        gain = hi
        for i in range(n):
            target = lo if speech[i] else hi
            gain += (target - gain) * (dn if target < gain else up)
            music[i] = bed[i] / base * sr_v * gain * min(1, (TOTAL - i / SR) / 0.5)

fk = sr_v / 0.2 * 0.8
mix = [voice[i] + music[i] + fx[i] * fk * (0.45 if speech[i] else 1) for i in range(n)]
pk = max(map(abs, mix)) if mix else 0
if pk > 0:
    mix = [math.tanh(1.2 * v / pk) / math.tanh(1.2) * 0.95 for v in mix]


def wav(path, q):
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(array.array("h", (int(max(-1, min(1, v)) * 32767) for v in q)).tobytes())


raw = CFG["out_raw"]
wav(raw, mix)
lufs, tp = CFG.get("lufs", -14), CFG.get("true_peak", -1.5)
log = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", raw, "-af", f"loudnorm=I={lufs}:TP={tp}:LRA=11:print_format=json", "-f", "null", "-"],
                     capture_output=True, text=True).stderr
m = json.JSONDecoder().raw_decode(log[log.rindex("{"):])[0]
finite = all(math.isfinite(float(m[k])) for k in ("input_i", "input_tp", "input_lra", "input_thresh"))
if finite:
    af = (f"loudnorm=I={lufs}:TP={tp}:LRA=11:linear=true:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
          f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}")
    subprocess.check_call(["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", raw, "-af", af, "-ar", "44100", "-ac", "2", CFG["out_wav"]])
else:  # pure silence: nothing to normalise
    subprocess.check_call(["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", raw, "-ar", "44100", "-ac", "2", CFG["out_wav"]])

sv, sm = [], []
for i in range(0, max(0, n - 882), 882):
    b = rms(voice[i:i + 882])
    if b > 0.02:
        sv.append(b)
        sm.append(rms([music[j] + fx[j] * fk * 0.45 for j in range(i, i + 882)]))
gap = round(20 * math.log10(rms(sv) / max(rms(sm), 1e-9)), 1) if sv else None
json.dump({"total": TOTAL, "lines": cues, "taps": TAPS, "placeholder_voice": not real_voice, "music": bool(CFG.get("music")),
           "voice_over_music_db": gap, "input_lufs": m["input_i"] if finite else None},
          open(CFG["cues"], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps({"total": TOTAL, "voice_over_music_db": gap, "placeholder_voice": not real_voice, "normalised": finite}))
