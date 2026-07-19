"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { marketAccount, ApiError, type MarketMyListing } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { Section } from "./Section";

function Row({ listing, onChange }: { listing: MarketMyListing; onChange: (patch: Partial<MarketMyListing>) => void }) {
  const [price, setPrice] = useState(listing.price);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const savePrice = async () => {
    const p = Number(price);
    if (!p || p <= 0 || price === listing.price) {
      setEditing(false);
      setPrice(listing.price);
      return;
    }
    setBusy(true);
    try {
      await marketAccount.editListing(listing.id, { price: p });
      onChange({ price: String(p) });
      setEditing(false);
    } catch {
      setPrice(listing.price);
    } finally {
      setBusy(false);
    }
  };

  const markSold = async () => {
    setBusy(true);
    try {
      await marketAccount.markSold(listing.id);
      onChange({ status: "SOLD" });
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const isSold = listing.status === "SOLD";

  return (
    <div className="flex items-center gap-3 py-2.5">
      <Link href={`/market/listings/${listing.id}`} className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-light">
        {listing.imageUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element -- listing thumbnail
          <img src={listing.imageUrls[0]} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-lg text-muted">🔧</div>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/market/listings/${listing.id}`} className="line-clamp-1 text-sm font-medium text-text hover:text-primary">
          {listing.title}
        </Link>
        <div className="mt-0.5 flex items-center gap-2 text-sm">
          {editing ? (
            <>
              <span className="text-muted">$</span>
              <input
                value={price}
                onChange={e => setPrice(e.target.value)}
                onKeyDown={e => e.key === "Enter" && savePrice()}
                inputMode="decimal"
                autoFocus
                className="h-8 w-20 rounded border border-primary bg-white px-2 text-sm outline-none"
              />
              <button onClick={savePrice} disabled={busy} className="text-xs font-medium text-primary">Save</button>
            </>
          ) : (
            <>
              <span className="font-semibold text-text">${Number(listing.price).toLocaleString()}</span>
              {!isSold && (
                <button onClick={() => setEditing(true)} className="text-xs font-medium text-primary hover:underline">Edit</button>
              )}
            </>
          )}
          {isSold && <span className="rounded bg-border px-1.5 py-0.5 text-[11px] font-semibold uppercase text-muted">Sold</span>}
        </div>
      </div>
      {!isSold && (
        <button
          onClick={markSold}
          disabled={busy}
          className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
        >
          Mark sold
        </button>
      )}
    </div>
  );
}

export function MyListingsSection() {
  const [listings, setListings] = useState<MarketMyListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const l = await marketAccount.myListings();
        if (!ignore) setListings(l);
      } catch (err) {
        if (!ignore) setError(err instanceof ApiError ? err.message : "Couldn't load your listings.");
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const patch = (id: string, p: Partial<MarketMyListing>) =>
    setListings(prev => prev?.map(l => (l.id === id ? { ...l, ...p } : l)) ?? prev);

  return (
    <Section
      title="My listings"
      action={
        <Link href="/market/sell" className="text-sm font-medium text-primary hover:underline">
          + New listing
        </Link>
      }
    >
      {error && <p className="text-sm text-red">{error}</p>}
      {listings === null && !error && <Skeleton className="h-24 w-full" />}
      {listings && listings.length === 0 && (
        <p className="text-sm text-muted">You haven&rsquo;t listed anything yet. Tap “New listing” to sell a part.</p>
      )}
      {listings && listings.length > 0 && (
        <div className="divide-y divide-border">
          {listings.map(l => (
            <Row key={l.id} listing={l} onChange={p => patch(l.id, p)} />
          ))}
        </div>
      )}
    </Section>
  );
}
