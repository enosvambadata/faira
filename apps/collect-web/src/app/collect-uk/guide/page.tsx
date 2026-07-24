"use client";

import { Package } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";

// Public, self-contained company user guide. Viewable in the browser and
// printable to PDF (the header + print button are hidden when printing).
export default function CompanyGuidePage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      <header className="no-print border-b border-border bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3.5">
          <span className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-dark text-white">
              <Package size={17} />
            </span>
            <span className="text-lg font-semibold text-text">Vamba Collect — Company Guide</span>
          </span>
          <Button type="button" size="md" variant="secondary" onClick={() => window.print()}>
            Print / Save as PDF
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 text-[15px] leading-relaxed text-text sm:px-6">
        <h1 className="text-2xl font-bold">Vamba Collect — Company User Guide</h1>
        <p className="mt-2 text-muted">
          Everything to run collection, tracking, quotes and payments in one place. About 15 minutes to get going.
        </p>

        <Section n="1" title="Getting started">
          <ol className="ml-5 list-decimal space-y-1.5">
            <li><b>Register</b> at collect.vambadata.com — enter your email and a password.</li>
            <li><b>Confirm your email</b> — click the link in the email from Vamba (check spam too).</li>
            <li><b>Register your company</b> — after signing in, enter your company name and the countries you ship to.</li>
            <li>You&rsquo;re now the <b>Admin</b> and can set everything else up.</li>
          </ol>
        </Section>

        <Section n="2" title="Set up your company (do these first)">
          <h3 className="mt-1 font-semibold">2.1 Branding — make it yours</h3>
          <p className="mt-1">
            <b>Settings → Branding</b>: set your <b>brand name</b> and <b>logo URL</b> (a public image link). Your customers
            then see your brand — not Vamba — on booking, tracking and checkout. A live preview shows how it looks.
          </p>
          <h3 className="mt-4 font-semibold">2.2 Warehouse — where parcels are delivered</h3>
          <p className="mt-1">
            <b>Warehouses → Add warehouse</b>: address, city, postcode and opening hours. This is where our drivers drop the
            parcels they collect.
          </p>
          <h3 className="mt-4 font-semibold">2.3 Team — add your staff</h3>
          <p className="mt-1">
            <b>Team → Add a team member</b>: enter their email (they sign up first) and a role. <b>Admin</b> = full access;{" "}
            <b>Dispatcher</b> = day-to-day work (no Team/Settings).
          </p>
        </Section>

        <Section n="3" title="Taking bookings from customers">
          <p>
            Share your <b>booking page</b> link (from your portal) on WhatsApp, your website or social media. When a
            customer books, it appears under the <b>Bookings</b> tab — customer, address, items and status. Our drivers
            collect and deliver to your warehouse.
          </p>
        </Section>

        <Section n="4" title="Receiving parcels">
          <p>
            When parcels arrive, open the <b>Receive</b> tab, tap <b>Start scanning</b> and point your phone camera at each
            parcel&rsquo;s QR label — each scan confirms receipt. No special scanner needed; a manual reference entry is
            there as a fallback.
          </p>
        </Section>

        <Section n="5" title="Pricing, quotes and payments">
          <ol className="ml-5 list-decimal space-y-1.5">
            <li><b>Pricing tab</b> → <b>Load standard rate card</b>, then edit prices or add items.</li>
            <li>Tap the customer&rsquo;s items (+ / −) to build a total; enter their name and WhatsApp number.</li>
            <li><b>Create payment link</b> — uses the quote total automatically.</li>
            <li><b>Send link on WhatsApp</b> (or Copy link). The customer pays by card; it marks <b>Paid</b> automatically.</li>
            <li>The <b>Payments</b> tab tracks every payment (Awaiting / Paid).</li>
          </ol>
        </Section>

        <Section n="6" title="Shipments, manifests and tracking">
          <h3 className="mt-1 font-semibold">6.1 Create a shipment</h3>
          <p className="mt-1"><b>Shipments → New shipment</b> (e.g. &ldquo;Container to Harare — August&rdquo;). Open it to manage recipients, the manifest and updates.</p>
          <h3 className="mt-4 font-semibold">6.2 Recipients</h3>
          <p className="mt-1">Add the customers whose goods are on the shipment — from a booking or manually by name + phone. Each gets a tracking link.</p>
          <h3 className="mt-4 font-semibold">6.3 The manifest</h3>
          <p className="mt-1">
            Open <b>Manifest</b>, add each parcel (sender, receiver, contents, weight, value), then <b>Finalize</b> to seal
            it. From there: <b>Shipping labels</b> (QR label per parcel), <b>Load parcels</b> (scan onto the container —
            unloaded ones show as short-shipped), and <b>Print / Download CSV</b> for the carrier and customs.
          </p>
          <h3 className="mt-4 font-semibold">6.4 Transit updates</h3>
          <p className="mt-1">
            Tap a preset (At UK port, Vessel sailed, Arrived at port, At border, At storage) or type your own, add a
            location/note, and post it. <b>Every customer on the shipment is texted automatically</b> with a link to their
            live tracking. On the final update, add the storage address + pickup dates.
          </p>
        </Section>

        <Section n="7" title="Printing labels">
          <p>
            On any label page use the <b>A4 paper / Label 4×6</b> toggle. <b>A4</b> prints on any printer (stick/tape on
            boxes). <b>Label 4×6</b> prints one label per 100×150mm roll on a thermal label printer (many are Bluetooth, so
            your phone can print too).
          </p>
        </Section>

        <Section n="8" title="Collection weeks & billing">
          <p>
            <b>Collection weeks</b> — declare the days you collect; customers book into your next week. <b>Billing</b> —
            your weekly statement of collection charges.
          </p>
        </Section>

        <Section n="9" title="Need help?">
          <p>Contact Vamba on WhatsApp: <b>+44 7459 920895</b>. We&rsquo;re happy to walk you through your first shipment.</p>
        </Section>

        <p className="mt-10 border-t border-border pt-4 text-center text-xs text-muted">Vamba Collect — company user guide</p>
      </main>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-text">
        <span className="text-primary">{n}.</span> {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
