import type { Metadata } from "next";
import Link from "next/link";
import { CollectBrand } from "@/components/collect-uk/CollectBrand";

export const metadata: Metadata = {
  title: "Privacy notice — Vamba Collect",
  description: "How Vamba Collect handles your personal information.",
};

// Plain-English UK GDPR privacy notice. Static content by design: every
// claim in here must stay true of the actual system, so change this page
// whenever data handling changes (new provider, new retention rule, etc.).

const SECTIONS: { heading: string; body: React.ReactNode }[] = [
  {
    heading: "Who we are",
    body: (
      <p>
        Vamba Collect is operated by <strong>Vambadata Ltd</strong>, a company registered in the United
        Kingdom (&ldquo;we&rdquo;, &ldquo;us&rdquo;). We are the data controller for the personal
        information described in this notice. You can contact us about anything in this notice at{" "}
        <a href="mailto:enos@vambadata.com" className="text-primary underline">
          enos@vambadata.com
        </a>
        .
      </p>
    ),
  },
  {
    heading: "What we collect",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <strong>When you book a collection:</strong> your name, contact number or email, collection
          address and postcode, the destination country, and a description of what you are sending
          (item types, parcel count, size, any special instructions you add).
        </li>
        <li>
          <strong>When our driver collects:</strong> a photo of the parcels at your doorstep as proof
          of collection. The photo may incidentally show part of your property.
        </li>
        <li>
          <strong>Derived information:</strong> we convert your postcode to approximate map
          coordinates so we can plan efficient driver routes.
        </li>
        <li>
          <strong>If you create an account</strong> (shipping companies and drivers): your email
          address and the details you enter about your company.
        </li>
      </ul>
    ),
  },
  {
    heading: "Why we use it",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>To arrange, route, and carry out the collection you booked (performance of a contract).</li>
        <li>
          To send you service messages about your booking — confirmation, your collection week, your
          collection day, collection and delivery updates, and cancellations. These are not marketing
          messages.
        </li>
        <li>To keep records of collections, handovers, and disputes (our legitimate interests).</li>
      </ul>
    ),
  },
  {
    heading: "Who we share it with",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <strong>The shipping company you booked with.</strong> They receive your booking details so
          they can ship your parcels onward — they are a separate business and handle your information
          under their own terms once your parcels are handed over.
        </li>
        <li>
          <strong>Service providers who run our platform:</strong> hosting and database providers
          (Railway, Supabase), photo storage (Cloudinary), and our messaging provider for the texts we
          send you. They process data only on our instructions.
        </li>
        <li>We do not sell your personal information, and we do not use it for advertising.</li>
      </ul>
    ),
  },
  {
    heading: "How long we keep it",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Booking and collection records: kept while your collection is in progress, then retained as part of our business records for up to 6 years (in line with UK record-keeping norms).</li>
        <li>Proof-of-collection photos: kept for up to 12 months after handover, then deleted.</li>
        <li>Cancelled bookings: kept for up to 12 months, then deleted.</li>
      </ul>
    ),
  },
  {
    heading: "Your rights",
    body: (
      <>
        <p>Under UK data protection law you can ask us to:</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>show you the personal information we hold about you (access);</li>
          <li>correct it if it is wrong (rectification);</li>
          <li>delete it where we no longer need it (erasure);</li>
          <li>limit how we use it, or object to a use (restriction and objection).</li>
        </ul>
        <p className="mt-2">
          To exercise any of these, email{" "}
          <a href="mailto:enos@vambadata.com" className="text-primary underline">
            enos@vambadata.com
          </a>
          . If you are unhappy with how we handle your information you can complain to the UK
          Information Commissioner&rsquo;s Office (
          <a href="https://ico.org.uk" className="text-primary underline" target="_blank" rel="noreferrer">
            ico.org.uk
          </a>
          ).
        </p>
      </>
    ),
  },
  {
    heading: "Changes to this notice",
    body: (
      <p>
        If how we handle your information changes, we will update this page. This notice was last
        updated on 13 July 2026.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="theme-collect flex min-h-screen flex-col bg-bg text-text">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="cursor-pointer">
            <CollectBrand />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-bold text-dark">Privacy notice</h1>
        <p className="mt-2 text-sm text-muted">
          The short version: we collect what we need to pick up your parcels and keep you informed,
          we share your booking with the shipping company you chose, and we never sell your data.
          The detail is below.
        </p>

        <div className="mt-8 flex flex-col gap-8 text-[15px] leading-relaxed text-text">
          {SECTIONS.map(section => (
            <section key={section.heading}>
              <h2 className="mb-2 text-lg font-semibold text-dark">{section.heading}</h2>
              {section.body}
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-border bg-white">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-6 py-6 text-sm text-muted">
          <span>Vamba Collect — a Vambadata product</span>
          <Link href="/" className="cursor-pointer transition-colors duration-200 hover:text-primary">
            Home
          </Link>
        </div>
      </footer>
    </div>
  );
}
