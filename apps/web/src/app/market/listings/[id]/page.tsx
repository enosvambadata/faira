"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { market, marketMessages, ApiError, type MarketListingDetail } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { ShieldIcon } from "@/components/market/icons";
import { Check } from "@/components/ui/icons";
import { useMarketAuth } from "@/components/market/useMarketAuth";

const CONDITION_LABELS: Record<string, string> = {
  NEW: "New",
  LIKE_NEW: "Like new",
  GOOD: "Good — used",
  FAIR: "For parts / fair",
};

function formatPrice(price: string): string {
  const n = Number(price);
  return Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `$${price}`;
}

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { userId, signedIn } = useMarketAuth();
  const [listing, setListing] = useState<MarketListingDetail | null>(null);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const messageSeller = async () => {
    if (!signedIn) {
      router.push(`/login?next=/market/listings/${id}`);
      return;
    }
    setStarting(true);
    try {
      const conv = await marketMessages.start(id);
      router.push(`/market/messages/${conv.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start a conversation.");
      setStarting(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setLoading(true);
      try {
        const l = await market.get(id);
        if (!ignore) setListing(l);
      } catch (err) {
        if (!ignore) setError(err instanceof ApiError ? err.message : "Couldn't load this listing.");
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [id]);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <Link href="/market" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-primary">
        ← Back to results
      </Link>

      {error && <Alert tone="error">{error}</Alert>}

      {loading && (
        <div className="grid gap-8 md:grid-cols-2">
          <Skeleton className="aspect-square w-full" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-10 w-1/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      )}

      {!loading && listing && (
        <>
          <div className="grid gap-8 md:grid-cols-2">
            {/* gallery */}
            <div className="flex flex-col gap-3">
              <div className="aspect-square overflow-hidden rounded-lg border border-border bg-light">
                {listing.imageUrls[active] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- arbitrary Cloudinary seller photos; next/image remote config deferred
                  <img src={listing.imageUrls[active]} alt={listing.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-6xl text-muted">🔧</div>
                )}
              </div>
              {listing.imageUrls.length > 1 && (
                <div className="flex gap-2 overflow-x-auto">
                  {listing.imageUrls.map((url, i) => (
                    <button
                      key={url}
                      onClick={() => setActive(i)}
                      className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 ${i === active ? "border-primary" : "border-border"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail of the same seller photo */}
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* buy box */}
            <div className="flex flex-col gap-4">
              <div>
                {listing.category && (
                  <Link
                    href={`/market?categoryIds=${listing.category.id}`}
                    className="text-xs font-semibold uppercase tracking-wide text-primary hover:underline"
                  >
                    {listing.category.name}
                  </Link>
                )}
                <h1 className="mt-1 text-2xl font-bold leading-snug tracking-tight text-text">{listing.title}</h1>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-3xl font-extrabold tracking-tight text-text">{formatPrice(listing.price)}</span>
                <span className="rounded-md bg-primary-light px-2.5 py-1 text-xs font-semibold text-primary-dark">
                  {CONDITION_LABELS[listing.condition] ?? listing.condition}
                </span>
              </div>

              <div className="rounded-lg border border-border bg-white p-4">
                <div className="flex flex-col gap-3">
                  {listing.seller.id === userId ? (
                    <p className="text-center text-sm text-muted">This is your listing.</p>
                  ) : (
                    <Link
                      href={`/market/listings/${id}/checkout`}
                      className="grid h-12 place-items-center rounded-full bg-primary font-semibold text-white transition-colors hover:bg-primary-dark"
                    >
                      Buy It Now
                    </Link>
                  )}
                </div>

                <div className="mt-4 flex items-start gap-2 border-t border-border pt-3 text-sm text-green">
                  <ShieldIcon size={18} />
                  <p className="text-muted">
                    <span className="font-semibold text-green">Escrow protected.</span> Your payment is held until you
                    confirm the part arrived as described.
                  </p>
                </div>
              </div>

              {/* seller */}
              <div className="flex items-center gap-3 rounded-lg border border-border bg-white p-4">
                <div className="grid h-11 w-11 place-items-center rounded-full bg-primary-light font-bold text-primary">
                  {(listing.seller.displayName ?? "S").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-semibold text-text">
                    {listing.seller.displayName ?? "Faira seller"}
                    {listing.seller.isVerified && (
                      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-primary">
                        <Check size={13} /> Verified
                      </span>
                    )}
                  </p>
                  {listing.seller.city && <p className="text-sm text-muted">{listing.seller.city}</p>}
                </div>
                {listing.seller.id !== userId && (
                  <button
                    onClick={messageSeller}
                    disabled={starting}
                    className="rounded-md border border-primary px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary-light disabled:opacity-50"
                  >
                    {starting ? "…" : "Message"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* description + specs */}
          <div className="mt-8 grid gap-8 md:grid-cols-2">
            {listing.description && (
              <div>
                <h2 className="mb-2 text-lg font-semibold text-text">Description</h2>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{listing.description}</p>
              </div>
            )}
            {Object.keys(listing.attributes).length > 0 && (
              <div>
                <h2 className="mb-2 text-lg font-semibold text-text">Item specifics</h2>
                <dl className="divide-y divide-border rounded-lg border border-border bg-white text-sm">
                  {Object.entries(listing.attributes).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
                      <dt className="capitalize text-muted">{k}</dt>
                      <dd className="font-medium text-text">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
