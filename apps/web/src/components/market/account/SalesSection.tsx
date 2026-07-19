"use client";

import { useEffect, useState } from "react";
import { marketAccount, ApiError, type MarketSale } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { Section } from "./Section";

export function SalesSection() {
  const [sales, setSales] = useState<MarketSale[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const s = await marketAccount.sales();
        if (!ignore) setSales(s);
      } catch (err) {
        if (!ignore) setError(err instanceof ApiError ? err.message : "Couldn't load your sales.");
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <Section title="Sales">
      {error && <p className="text-sm text-red">{error}</p>}
      {sales === null && !error && <Skeleton className="h-20 w-full" />}
      {sales && sales.length === 0 && <p className="text-sm text-muted">No sales yet. They&rsquo;ll appear here once buyers order your parts.</p>}
      {sales && sales.length > 0 && (
        <div className="divide-y divide-border">
          {sales.map(s => (
            <div key={s.id} className="flex items-center gap-3 py-2.5">
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-light">
                {s.listing.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- listing thumbnail
                  <img src={s.listing.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-muted">🔧</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-sm font-medium text-text">{s.listing.title}</p>
                <p className="text-xs text-muted">{new Date(s.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-text">${Number(s.priceAtPurchase).toLocaleString()}</p>
                <p className="text-xs text-muted">{s.displayStatus}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
