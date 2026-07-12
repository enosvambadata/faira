import Link from "next/link";
import {
  Package,
  Truck,
  Building,
  MapPin,
  MessageSquare,
  Globe,
  CheckCircle,
} from "@/components/ui/icons";

// Landing follows the "Trust & Authority + Conversion" pattern from the
// Faira Collect UK design system: hero with CTA above the fold, proof
// band, how-it-works, audience split, single clear CTA path. Styled links
// (not <Button> inside <Link>) so no interactive element nests inside an
// anchor.

const CTA_PRIMARY =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-[15px] font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const CTA_SECONDARY =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-white px-6 py-3 text-[15px] font-semibold text-text transition-colors duration-200 hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const STEPS = [
  {
    icon: MapPin,
    title: "Customers book online",
    body: "Share your booking link. Your customers request a doorstep collection in under two minutes — no account needed.",
  },
  {
    icon: Truck,
    title: "One Faira driver collects",
    body: "We pool collections across companies into one efficient round, with photo proof at every doorstep.",
  },
  {
    icon: Building,
    title: "Delivered to your warehouse",
    body: "Parcels arrive at your warehouse the same day. You confirm handover and ship as normal.",
  },
];

const COMPANY_POINTS = [
  "No UK collection fleet to run — one shared driver network",
  "A branded booking link your customers can use today",
  "Live status on every booking, from request to handover",
];

const CUSTOMER_POINTS = [
  "Doorstep collection booked in minutes, no account needed",
  "SMS updates at every step, plus a live tracking link",
  "Photo proof when your parcel is collected",
];

export default function WelcomePage() {
  return (
    <div className="theme-collect flex min-h-screen flex-col bg-bg text-text">
      <header className="border-b border-border bg-white">
        <nav className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <span className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-dark text-white">
              <Package size={20} />
            </span>
            <span className="text-lg font-semibold">Faira Collect</span>
          </span>
          <div className="flex items-center gap-3">
            <Link
              href="/login?next=/collect-uk"
              className="cursor-pointer rounded-md px-4 py-2 text-sm font-semibold text-text transition-colors duration-200 hover:text-primary"
            >
              Sign in
            </Link>
            <Link
              href="/signup?redirect=/collect-uk/register"
              className="hidden cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-primary-dark sm:inline-flex"
            >
              Get started
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-6 pb-16 pt-14 sm:pt-20 text-center">
          <p className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-white px-4 py-1.5 text-[13px] font-semibold text-muted">
            <Globe size={15} className="text-primary" />
            Built for African shipping companies operating in the UK
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight text-dark sm:text-5xl">
            Faira Collect
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-lg font-medium text-primary">
            The shared UK parcel-collection network
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted">
            Stop running your own vans. One Faira driver collects from all your customers&rsquo;
            doorsteps and delivers straight to your warehouse — while they get booking links, SMS
            updates, and live tracking.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup?redirect=/collect-uk/register" className={CTA_PRIMARY}>
              Register your company
            </Link>
            <Link href="/login?next=/collect-uk" className={CTA_SECONDARY}>
              Sign in to your portal
            </Link>
          </div>
        </section>

        <section aria-label="Why companies use Faira Collect" className="border-y border-border bg-white">
          <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-8 px-6 py-10 text-center sm:grid-cols-3">
            <div>
              <p className="text-3xl font-bold text-dark">1 driver</p>
              <p className="mt-1 text-sm text-muted">One shared collection round instead of a fleet per company</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-dark">2 minutes</p>
              <p className="mt-1 text-sm text-muted">For a customer to book a doorstep collection — no account</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-dark">Every step</p>
              <p className="mt-1 text-sm text-muted">SMS updates and live tracking from booking to handover</p>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-6 py-16">
          <h2 className="text-center text-2xl font-bold text-dark sm:text-3xl">How it works</h2>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="rounded-lg border border-border bg-white p-6 shadow-sm transition-shadow duration-200 hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-light text-primary">
                    <step.icon size={22} />
                  </span>
                  <span className="text-sm font-semibold text-muted">Step {i + 1}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-dark">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border bg-white">
          <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-8 px-6 py-16 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-bg p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-dark text-white">
                <Building size={22} />
              </span>
              <h2 className="mt-4 text-xl font-semibold text-dark">For shipping companies</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {COMPANY_POINTS.map(point => (
                  <li key={point} className="flex items-start gap-2.5 text-sm leading-relaxed text-text">
                    <CheckCircle size={18} className="mt-0.5 shrink-0 text-green" />
                    {point}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup?redirect=/collect-uk/register"
                className="mt-6 inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-primary transition-colors duration-200 hover:text-primary-dark"
              >
                Set up your company &rarr;
              </Link>
            </div>
            <div className="rounded-lg border border-border bg-bg p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-white">
                <MessageSquare size={22} />
              </span>
              <h2 className="mt-4 text-xl font-semibold text-dark">For their customers</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {CUSTOMER_POINTS.map(point => (
                  <li key={point} className="flex items-start gap-2.5 text-sm leading-relaxed text-text">
                    <CheckCircle size={18} className="mt-0.5 shrink-0 text-green" />
                    {point}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm text-muted">
                Booking links are shared by your shipping company — ask them for yours.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-dark sm:text-3xl">Ready to hand off your UK collections?</h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted">
            Register your company, add your warehouse, and share your booking link — all in one
            afternoon.
          </p>
          <div className="mt-7">
            <Link href="/signup?redirect=/collect-uk/register" className={CTA_PRIMARY}>
              Create your company account
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 px-6 py-6 text-sm text-muted sm:flex-row">
          <span>Faira Collect — a Vambadata product</span>
          <div className="flex items-center gap-5">
            <Link href="/fulfilment" className="cursor-pointer transition-colors duration-200 hover:text-primary">
              Faira Fulfilment
            </Link>
            <Link href="/login?next=/collect-uk" className="cursor-pointer transition-colors duration-200 hover:text-primary">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
