"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { marketWatchlist, type MarketWatchlistItem } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { ListingCard } from "@/components/market/ListingCard";
import { useMarketAuth } from "@/components/market/useMarketAuth";

export default function WatchlistPage() {
  const { signedIn, loading: authLoading } = useMarketAuth();
  const [items, setItems] = useState<MarketWatchlistItem[] | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let ignore = false;
    const load = async () => {
      try {
        const list = await marketWatchlist.list();
        if (!ignore) setItems(list);
      } catch {
        if (!ignore) setItems([]);
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [signedIn]);

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6">
      <h1 className="mb-5 text-xl font-bold tracking-tight text-text">Your watchlist</h1>

      {authLoading && <Skeleton className="h-40 w-full" />}

      {!authLoading && !signedIn && (
        <EmptyState
          icon={<span className="text-3xl">❤️</span>}
          title="Sign in to see your watchlist"
          description="Save parts you're interested in and find them here across devices."
          action={
            <Link href="/login?next=/market/watchlist">
              <Button size="md">Sign in</Button>
            </Link>
          }
        />
      )}

      {!authLoading && signedIn && items === null && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="aspect-[4/3] w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      )}

      {!authLoading && signedIn && items && items.length === 0 && (
        <EmptyState
          icon={<span className="text-3xl">🔧</span>}
          title="Nothing saved yet"
          description="Tap the heart on any part to add it to your watchlist."
          action={
            <Link href="/market">
              <Button size="md">Browse parts</Button>
            </Link>
          }
        />
      )}

      {!authLoading && signedIn && items && items.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {items.map(item => (
            <ListingCard
              key={item.id}
              listing={{
                id: item.id,
                title: item.title,
                price: item.price,
                condition: "GOOD",
                city: item.city,
                imageUrls: item.imageUrls,
                createdAt: item.savedAt,
                universalFit: false,
                seller: { name: null, rating: null, ratingCount: 0, verified: false },
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
