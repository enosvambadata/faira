import type { Metadata } from "next";
import { Suspense } from "react";
import { MarketChrome } from "@/components/market/MarketChrome";
import { WatchlistProvider } from "@/components/market/WatchlistProvider";

export const metadata: Metadata = {
  title: "Faira Parts — car parts & engines marketplace",
  description:
    "Buy car parts, engines and gearboxes in Zimbabwe with escrow protection. Filter to the parts that fit your car.",
};

// The storefront is inherently query-driven (search, garage, filters), so opt
// the whole segment out of static prerendering rather than statically bake an
// empty first page.
export const dynamic = "force-dynamic";

export default function MarketLayout({ children }: { children: React.ReactNode }) {
  return (
    <WatchlistProvider>
      <div className="flex min-h-screen flex-col bg-bg">
        <Suspense fallback={<div className="h-[184px] border-b border-border bg-white" />}>
          <MarketChrome />
        </Suspense>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border bg-light">
          <div className="mx-auto flex max-w-[1280px] flex-wrap justify-between gap-3 px-6 py-6 text-xs text-muted">
            <span>
              <b className="text-text">faira Parts</b> — Zimbabwe&rsquo;s marketplace for car parts &amp; engines. Buy
              with escrow protection.
            </span>
            <span>Buy &middot; Sell a part &middot; My Garage &middot; Escrow &amp; buyer protection &middot; Help</span>
          </div>
        </footer>
      </div>
    </WatchlistProvider>
  );
}
