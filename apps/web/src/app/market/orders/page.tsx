"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { marketBuyerOrders, type MarketOrderListItem } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { useMarketAuth } from "@/components/market/useMarketAuth";

export default function OrdersPage() {
  const { signedIn, loading: authLoading } = useMarketAuth();
  const [orders, setOrders] = useState<MarketOrderListItem[] | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let ignore = false;
    (async () => {
      try {
        const list = await marketBuyerOrders.purchases();
        if (!ignore) setOrders(list);
      } catch {
        if (!ignore) setOrders([]);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [signedIn]);

  return (
    <div className="mx-auto max-w-[760px] px-4 py-6 sm:px-6">
      <h1 className="mb-5 text-xl font-bold tracking-tight text-text">Your orders</h1>

      {authLoading && <Skeleton className="h-40 w-full" />}

      {!authLoading && !signedIn && (
        <EmptyState
          icon={<span className="text-3xl">📦</span>}
          title="Sign in to see your orders"
          description="Track the parts you've bought and confirm delivery."
          action={
            <Link href="/login?next=/market/orders">
              <Button size="md">Sign in</Button>
            </Link>
          }
        />
      )}

      {!authLoading && signedIn && orders === null && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!authLoading && signedIn && orders && orders.length === 0 && (
        <EmptyState
          icon={<span className="text-3xl">🔧</span>}
          title="No orders yet"
          description="Parts you buy show up here so you can track them."
          action={
            <Link href="/market">
              <Button size="md">Browse parts</Button>
            </Link>
          }
        />
      )}

      {!authLoading && signedIn && orders && orders.length > 0 && (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-white">
          {orders.map(o => (
            <li key={o.id}>
              <Link href={`/market/orders/${o.id}`} className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-light">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-light">
                  {o.listing.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- listing thumbnail
                    <img src={o.listing.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-lg text-muted">🔧</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-medium text-text">{o.listing.title}</p>
                  <p className="text-xs text-muted">{new Date(o.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-text">${Number(o.priceAtPurchase).toLocaleString()}</p>
                  <p className="text-xs text-muted">{o.displayStatus}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
