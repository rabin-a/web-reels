# Juniper Lane Laundry: reel series plan

Site: http://localhost:8765 (the demo site in examples/demo-site)

One question per reel, answered with one or two screens of the site. Each end card teases the next reel.
Only reel 01 is built in this example; 02 and 03 show how the plan continues.

| # | Post (date time) | Slug | Question (hook) | Screens / taps | Facts (ids) |
|---|------------------|------|-----------------|----------------|-------------|
| 1 | 2026-11-09 18:30 | 01-shirt-price | What does a shirt cost? | /prices.html: tap Shirts, tap Wash & press, ring the price; /about.html: ring the 48-hour promise; /: free pickup | two-taps, shirt-press, turnaround, free-pickup |
| 2 | 2026-11-12 18:30 | 02-duvet-price | What does a duvet cost? | /prices.html: tap Bedding, ring the duvet price; /terms.html: prices are a guide | duvet, price-guide |
| 3 | 2026-11-15 18:30 | 03-free-pickup | Do you pick up from my door? | /: scroll to pickup, ring the free-pickup and fee lines; /about.html: family-run since 2011 | free-pickup, pickup-fee, family |

## Rules
- Every number and promise on screen comes from facts.json (exact quote, page URL, date read).
- Taps and scrolling only on the site; never type, submit, log in or create accounts.
- Keep the short disclaimer on screen and the long one plus the AI label in the post text.
