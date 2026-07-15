# Vamba Collect — sales call sheet

Doorstep parcel collection for UK shipping companies. Pitch = **replace their van / courier cost** with shared collection routes.

**Your price:** ~**£30 per stop + £5–18 per parcel** (small £5 · medium £8 · large £12 · drum/XL £18). No monthly fee — they pay only when you collect.
**How it works:** you give the company a **booking link**; their customers book their own pickup; you collect and drop at the company's warehouse.
**Track outcomes** in `prospects.csv` (`call_status` / `contact_person` / `notes` columns).

---

## Call order (best first — these already pay for or run collection)

Each card: number(s) · corridor · **the cost you're beating** · the one line to open with.

### 1. Manc Global Logistics — `0161 818 9600` · Ghana
Beating: **own van at £150 + £1.80/mile.** → *"That van run is costing you £150+ a trip — we collect on shared routes for about £30 a stop."*

### 2. Coedma Freight Intl — `0116 251 8827` / `07568 066633` · Zimbabwe, South Africa
Beating: **already pays DPD £50–70/drum.** → *"You're already paying DPD to collect — we do the same for less, zero change for you."*

### 3. Excess Luggage — `0800 096 3839` · Zimbabwe + worldwide
Beating: **advertised £35 doorstep fee.** → *"Your £35 collection — we can do that for less on pooled routes and you keep the customer."*

### 4. AtoZ India Courier — `0121 794 2767` · India
Beating: **"free" collection (they eat ~£1/kg).** → *"Your free collection isn't free — it's in your margin. We make it genuinely cheap."*

### 5. West Indies Direct — `01708 748551` / `07971 835211` · Jamaica, Caribbean
Beating: **collection buried in £95–135 barrels.** → *"You collect any London postcode 7 days a week — that's a real cost line we can cut."*

### 6. Zan Shipping — `0808 304 2026` · Caribbean  *(ask for Winston)*
Beating: **nationwide doorstep collection, bundled.** → *"You collect boxes and drums nationwide — we run those routes cheaper."*

### 7. Gee Shipping (Caribbean Line) — `0203 086 8311` / `0795 023 1110` · Jamaica, Ghana
Beating: **doorstep collection London/Birmingham/Midlands/North.** → *"You cover the Midlands like we do — we can take the collection leg off you."*

### 8. Pak Direct Cargo — `0207 112 8444` / `0121 285 8555` / `0161 850 9666` · Pakistan
Beating: **multi-city collection incl. Coventry, next-day promises.** → *"Next-day collection needs reliable van capacity — that's exactly us."*

### 9. Cargo Lord — `0121 328 3232` · Pakistan, India, Europe
Beating: **door-to-door incl. collection, 4-city network.** → *"You run a 4-city collection network — we pool those routes so you don't run the vans."*

### 10. Apex Cargo (Xepa Intl) — `0116 254 0480` · Africa + Caribbean
Beating: **claimed nationwide collection.** → *"Your nationwide collection claim is exactly the cost we replace."*

### 11. Cargonaija — `0203 904 5521` · West Africa
Beating: **UK-wide home collection + postcode fees.** → *"Your postcode-based collection fees — we flatten that to one simple rate."*

### 12. Speedy Cargo — `07739 533816` / `07960 983240` · Pakistan  *(UPSELL, not replace)*
No collection today. → *"You don't offer doorstep pickup — we can be your collection arm so you can, without buying vans."*

> ⚠️ **Carib Shipping** (Catford) — verify they're still trading first (site shows shop-closed / placeholder number).
> ⏭️ **Skip:** Uni Metro, Express Freight, Trans P Shipping — thin BarrelCompare listings, no direct contact.

---

## The script

**Opener**
> "Hi, is that [company]? I'm [name] from **Vamba Collect** — we do doorstep parcel collection across the UK for shipping companies like yours. Got 30 seconds?"

**Hook** *(get them talking — use their card line above)*
> "When your customers send drums, barrels or boxes to [corridor], how do you get them from the doorstep to your warehouse — your own van, a courier, or do they drop off?"

**Pitch**
> "Right — so that's costing you [their number]. We run **shared** collection routes, so we pick up from all your customers on the same round. That gets a collection to about **£30 a stop plus £5–18 per parcel** — drums at the top. Well under your own van or a courier. You keep your customers and your shipping; we just take the van cost off your books."

**Ask**
> "We give you a **booking link** your customers use to book their own pickup, and we drop everything at your warehouse. No monthly fee — you pay only when we collect. Can I email you the details and grab 10 minutes this week?"

**If they push on price**
> "£30 per stop plus the parcel fee, that's it. Against [their number], you save on every pickup and never tie up a driver."

**If they don't collect at all (upsell)**
> "Even better — no vans to buy. We become your collection arm: you advertise doorstep pickup, we do the driving, you win the customers who won't drive to a drop-off."

---

## Email / WhatsApp version

> **Subject: Cheaper doorstep collection for [Company]'s customers**
>
> Hi [name], I'm [you] from **Vamba Collect**. We run shared doorstep parcel collection across the UK for shipping companies. Instead of your own van — or a courier — collecting drums/barrels/boxes from customers, we collect on pooled routes for **~£30/stop + £5–18 per parcel**, usually well under your current cost. You keep the shipping; we just handle pickup, with a booking link your customers use directly. Worth a quick call this week? — [you], [phone]

---

## Cold emails — ready to send from `enos@vambadata.com`

**Rules:** plain text, **one link, no images** (multiple links or images hurt inbox placement — one clean URL from a warmed mailbox is fine). One email per prospect, **spread over a day or two**, sign as Enos. Keep the opt-out line (UK B2B compliance). Swap `[phone]` for your number. The register link lands new companies on the "Register your shipping company" flow.

### Africa corridor

**→ Coedma Freight · `info@coedmafreight.com`**
Subject: A cheaper alternative to DPD for your collections
> Hi,
> I saw Coedma uses DPD Local to collect customers' drums and boxes before they ship to Zimbabwe and South Africa. We do that same doorstep collection on shared routes, so it comes in under DPD's per-drum rate — around £30 a stop plus £5–18 per parcel. You keep the shipping; we just handle the pickup, with a booking link your customers use themselves.
> Worth a quick look? You can see how it works and register in a couple of minutes here:
> https://collect.vambadata.com/signup?redirect=/collect-uk/register
> If it's not relevant, just say and I won't chase.
> Enos · Vamba Collect · [phone]

**→ Manc Global · `hello@manclogistics.co.uk`**
Subject: Cutting the cost of your Ghana collections
> Hi,
> I noticed Manc Global runs its own van for customer collections. We run shared collection routes across the UK, so we can pick up drums and boxes from your Ghana-bound customers for about £30 a stop plus £5–18 per parcel — well under a dedicated van and driver, with no vehicle to tie up. You keep the shipping; we handle the pickup via a booking link.
> Worth a quick look? You can see how it works and register in a couple of minutes here:
> https://collect.vambadata.com/signup?redirect=/collect-uk/register
> Not relevant? Just let me know and I'll leave it there.
> Enos · Vamba Collect · [phone]

**→ Excess Luggage · `info@excessluggage.co.uk`**
Subject: Your £35 doorstep collection — done for less
> Hi,
> You advertise doorstep collection at £35 for your Zimbabwe shipments. We run shared collection routes, so we can do the same pickup for less — around £30 a stop plus £5–18 per parcel — and you keep the customer and the shipping. They book their own pickup through a link; we bring it to you.
> Worth a quick look? You can see how it works and register in a couple of minutes here:
> https://collect.vambadata.com/signup?redirect=/collect-uk/register
> If not relevant, no worries — just say.
> Enos · Vamba Collect · [phone]

**→ Apex Cargo · `info@apexcargo.co.uk`**
Subject: The collection cost behind your nationwide pickups
> Hi,
> Apex offers collection across your Africa and Caribbean corridors. That collection leg is real cost — we run shared routes so it lands at about £30 a stop plus £5–18 per parcel, cheaper than running it yourself, across the UK. You keep the shipping; we handle pickup via a booking link your customers use.
> Worth a quick look? You can see how it works and register in a couple of minutes here:
> https://collect.vambadata.com/signup?redirect=/collect-uk/register
> If it's not for you, just let me know.
> Enos · Vamba Collect · [phone]

**→ Cargo to Africa · `info@cargotoafrica.co.uk`**
Subject: Doorstep collection for your Africa customers — cheaper
> Hi,
> You offer UK collection alongside your door-to-door service across Africa. We run shared collection routes, so we can take that pickup leg off you at around £30 a stop plus £5–18 per parcel — less than doing it in-house. You keep the shipping; customers book their own pickup through a link and we deliver to your warehouse.
> Worth a quick look? You can see how it works and register in a couple of minutes here:
> https://collect.vambadata.com/signup?redirect=/collect-uk/register
> Not relevant? Just say and I'll stop.
> Enos · Vamba Collect · [phone]

**→ Cargonaija · `info@cargonaija.com`**
Subject: One flat collection rate instead of postcode fees
> Hi,
> You collect UK-wide but charge collection by postcode. We run shared routes, so we can flatten that to one simple rate — around £30 a stop plus £5–18 per parcel — cheaper for your West Africa customers and simpler for you. You keep the shipping; they book their pickup through a link and we bring it in.
> Worth a quick look? You can see how it works and register in a couple of minutes here:
> https://collect.vambadata.com/signup?redirect=/collect-uk/register
> If it's not relevant, just let me know.
> Enos · Vamba Collect · [phone]

### Caribbean corridor

**→ West Indies Direct · `info@westindiesdirect.co.uk`**
Subject: The collection cost inside your barrels
> Hi,
> You collect any London postcode 7 days a week, with collection bundled into your barrel price. That pickup is a real cost line — we run shared routes so it lands at about £30 a stop plus £5–18 per parcel, which either widens your margin or lets you undercut on price. You keep the shipping; customers book pickup through a link.
> Worth a quick look? You can see how it works and register in a couple of minutes here:
> https://collect.vambadata.com/signup?redirect=/collect-uk/register
> Not relevant? Just say and I'll leave it.
> Enos · Vamba Collect · [phone]

**→ Zan Shipping · `winston@zanshippingservices.com`**
Subject: Cheaper doorstep collection for Zan's customers
> Hi Winston,
> You offer nationwide doorstep collection of boxes, crates and drums 7 days a week. We run shared collection routes across the UK, so we can handle those pickups at around £30 a stop plus £5–18 per parcel — less than running them yourself. You keep the shipping; your customers book their own pickup through a link and we deliver to you.
> Worth a quick look? You can see how it works and register in a couple of minutes here:
> https://collect.vambadata.com/signup?redirect=/collect-uk/register
> If it's not relevant, just let me know and I won't chase.
> Enos · Vamba Collect · [phone]

**→ Gee Shipping · `info@geeshipping.co.uk`**
Subject: Taking the collection leg off you (Midlands + North)
> Hi,
> Gee offers doorstep collection across London, Birmingham, the Midlands and North for your Caribbean and Ghana shipments. We cover the same ground on shared routes, so we can run those pickups at around £30 a stop plus £5–18 per parcel — cheaper than doing it in-house. You keep the shipping; customers book pickup through a link.
> Worth a quick look? You can see how it works and register in a couple of minutes here:
> https://collect.vambadata.com/signup?redirect=/collect-uk/register
> Not relevant? Just say.
> Enos · Vamba Collect · [phone]

### South Asia corridor

**→ Pak Direct Cargo · `info@pakdirectcargo.com`**
Subject: Reliable van capacity for your next-day collections
> Hi,
> You promise next-day collection across London, Birmingham, Manchester and Coventry. That needs reliable van capacity — which is exactly what we are. We run shared collection routes, so we can cover those pickups at around £30 a stop plus £5–18 per parcel. You keep the shipping to Pakistan; we handle the doorstep pickup via a booking link.
> Worth a quick look? You can see how it works and register in a couple of minutes here:
> https://collect.vambadata.com/signup?redirect=/collect-uk/register
> If it's not relevant, just let me know.
> Enos · Vamba Collect · [phone]

**→ Cargo Lord · `info@cargolord.com`**
Subject: Your 4-city collection network, without the vans
> Hi,
> Cargo Lord runs door-to-door collection across a Birmingham, Manchester, London and Bolton network. We run shared collection routes, so we can pool those pickups at around £30 a stop plus £5–18 per parcel — cheaper than running your own vehicles. You keep the shipping to Pakistan, India and Europe; customers book pickup through a link.
> Worth a quick look? You can see how it works and register in a couple of minutes here:
> https://collect.vambadata.com/signup?redirect=/collect-uk/register
> Not relevant? Just say and I'll stop.
> Enos · Vamba Collect · [phone]

**→ AtoZ India Courier · `info@atozindiacourier.co.uk`**
Subject: Your "free" collection isn't free — we make it cheap
> Hi,
> You offer free doorstep collection, which really means it's baked into your per-kg rate. We run shared collection routes, so we can handle those India-bound pickups at around £30 a stop plus £5–18 per parcel — a real, low cost you can see, instead of eating it. You keep the shipping; customers book pickup through a link.
> Worth a quick look? You can see how it works and register in a couple of minutes here:
> https://collect.vambadata.com/signup?redirect=/collect-uk/register
> If it's not relevant, just let me know.
> Enos · Vamba Collect · [phone]

**→ Speedy Cargo · `info@speedy-cargo.co.uk`  (upsell — you become their collection)**
Subject: Add doorstep collection without buying vans
> Hi,
> You ship to Pakistan but I couldn't see doorstep collection on your site. We can be that for you — you advertise pickup, we do the driving on shared routes at around £30 a stop plus £5–18 per parcel, and you win the customers who'd rather not drive to a drop-off. Your customers book pickup through a link and we deliver to you.
> Worth a quick look? You can see how it works and register in a couple of minutes here:
> https://collect.vambadata.com/signup?redirect=/collect-uk/register
> Not relevant? Just say.
> Enos · Vamba Collect · [phone]
