import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Package, User, CheckCircle } from "@/components/ui/icons";

export default function WelcomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white">
          <Package size={32} />
        </div>
        <h1 className="text-2xl font-semibold text-text">Faira Fulfilment</h1>
        <p className="mt-2 text-[15px] text-muted">
          Drop your parcel at a Faira hub. We handle the rest — secure handling, tracking, and hub-to-hub delivery
          across Zimbabwe.
        </p>

        <div className="mt-8 flex flex-col gap-3 text-left">
          <div className="flex items-center gap-3 rounded-md bg-white p-3.5">
            <CheckCircle size={20} className="shrink-0 text-primary" />
            <span className="text-sm text-text">Sell on WhatsApp, Facebook, or your own shop</span>
          </div>
          <div className="flex items-center gap-3 rounded-md bg-white p-3.5">
            <CheckCircle size={20} className="shrink-0 text-primary" />
            <span className="text-sm text-text">Drop off at a Harare or Bulawayo hub</span>
          </div>
          <div className="flex items-center gap-3 rounded-md bg-white p-3.5">
            <CheckCircle size={20} className="shrink-0 text-primary" />
            <span className="text-sm text-text">Your buyer gets a secure tracking link and collection code</span>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <Link href="/signup">
            <Button fullWidth size="lg">
              Register as a seller
            </Button>
          </Link>
          <Link href="/login">
            <Button fullWidth size="lg" variant="secondary">
              <User size={18} />
              Sign in
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
