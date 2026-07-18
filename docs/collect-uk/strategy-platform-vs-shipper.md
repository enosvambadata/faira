# Strategy note: neutral platform vs. own shipping

**Status:** Recommended — awaiting final sign-off from Enos.
**Date:** 2026-07-18

## The decision
Vamba has two businesses in tension:

- **Vamba Collect** — a multi-tenant SaaS + doorstep-collection network sold *to* UK diaspora shipping companies.
- **Vamba Shipping** — Vamba's *own* UK → Zimbabwe shipping operation (a customer/tenant of the same software).

**You cannot credibly sell the platform to shipping companies while competing with them on the same corridor.** No shipper will put their customers, rates and payments on software owned by a rival who ships the same route.

## Live evidence (this is not hypothetical)
Prospecting on WhatsApp, three of the first serious prospects were direct UK → Zimbabwe competitors to Vamba Shipping:

| Prospect | Corridor | Collection gap = the pitch | Competitor to Vamba Shipping? |
|---|---|---|---|
| **Zimbabwe Shipping Services** | UK → Zimbabwe | Already offers *free* collection (carries the van/driver cost) — we do it cheaper + nationwide | **Yes** |
| **Piri Shipping** | UK → Zimbabwe | Collection is "to be confirmed" — no reliable system — we make it booked + nationwide | **Yes** |
| **Adonai Logistics** | UK → Nigeria | Free pickup London-only & 20kg+ — we cover the rest of the UK + smaller parcels | No (Nigeria) |

Two of three are competitors. The conversations die the moment they realise Vamba also ships Zimbabwe.

## Recommendation
**Be the neutral collection + software provider. Do NOT operate as a rival shipper.**

1. **Wind down / ring-fence Vamba Shipping** — keep it only as a *reference case study* ("we run our own corridor on this system"), not an operating competitor. Reduce/stop taking Vamba Shipping's own customers on the Zimbabwe route.
2. **Lead outreach with the collection service**, not the platform. A logistics service ("our vans collect for you") is far less threatening than "put your business on my platform." Earn trust with collection, then introduce the software.
3. **Price per-transaction** (a fee per collection and/or per card payment processed), not a monthly SaaS subscription — these SMB owners resist subscriptions and pay per transaction.
4. **The moat is the collection driver network** — software is copyable; a national doorstep-collection network tied to the software is not. Lead with it.

## What this requires on the product (for a true SaaS)
- ✅ **White-label branding** — each company's customers see the company's brand, not Vamba (SCRUM-229, done).
- ⏳ **Stripe Connect** — each company connects their own Stripe and takes their own money; Vamba auto-collects a platform fee. This makes "your customers, your money" fully true (incl. the bank statement descriptor). **The last big SaaS gap.**
- ⏳ **Platform billing** — charge companies the per-transaction / subscription fee (plugs into `CollectUkSubscription`).

## Counter-argument (for the record)
Staying a *shipper* earns more revenue per transaction and keeps the end customer — but it's capital-heavy (containers, duty, agents), operationally brutal, and doesn't scale without you. The platform scales; shipping grinds. Given the prospect pool is full of same-corridor competitors, the platform path is also the only one that doesn't cannibalise the sales pipeline.
