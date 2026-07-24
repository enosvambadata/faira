import { Package, Check } from "@/components/ui/icons";

export default function PaySuccessPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5 px-6 py-3.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-dark text-white">
            <Package size={17} />
          </span>
          <span className="text-lg font-semibold text-text">Vamba Shipping</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green/15 text-green">
          <Check size={30} />
        </span>
        <h1 className="mt-5 text-2xl font-semibold text-text">Payment received</h1>
        <p className="mt-2 text-muted">
          Thank you — your payment is confirmed. We&apos;ll be in touch about your shipment. You can close this page.
        </p>
      </main>
    </div>
  );
}
