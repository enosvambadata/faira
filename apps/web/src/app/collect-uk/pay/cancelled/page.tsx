import { Package } from "@/components/ui/icons";

export default function PayCancelledPage() {
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
        <h1 className="text-2xl font-semibold text-text">Payment cancelled</h1>
        <p className="mt-2 text-muted">
          No payment was taken. If this was a mistake, reopen the payment link we sent you, or get in touch and we&apos;ll
          send a fresh one.
        </p>
      </main>
    </div>
  );
}
