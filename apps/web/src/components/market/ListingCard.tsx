import Link from "next/link";
import { type MarketListingSummary } from "@/lib/api";
import { ShieldIcon, StarIcon } from "./icons";
import { WatchlistHeart } from "./WatchlistHeart";

function formatPrice(price: string): string {
  const n = Number(price);
  if (!Number.isFinite(n)) return `$${price}`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// eBay-style product card: photo-forward, condition badge, fitment pill, bold
// price, trust signals. Dense so a grid of them scans quickly.
export function ListingCard({ listing, fitVehicle }: { listing: MarketListingSummary; fitVehicle?: string }) {
  const isNew = listing.condition === "NEW";
  // Defensive: an old/cached API response (mid-deploy) may omit seller.
  const seller = listing.seller ?? { name: null, rating: null, ratingCount: 0, verified: false };
  const hasRating = seller.rating != null && seller.ratingCount > 0;

  return (
    <Link
      href={`/market/listings/${listing.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-white shadow-[var(--shadow-card)] transition-shadow duration-200 hover:shadow-modal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-light">
        {listing.imageUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element -- seller photos are arbitrary Cloudinary URLs; next/image remote config deferred
          <img
            src={listing.imageUrls[0]}
            alt={listing.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl text-muted">🔧</div>
        )}

        <span
          className={`absolute left-2.5 top-2.5 rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white ${
            isNew ? "bg-green" : "bg-dark/75"
          }`}
        >
          {isNew ? "New" : "Used"}
        </span>

        <div className="absolute right-2.5 top-2.5">
          <WatchlistHeart listingId={listing.id} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="line-clamp-2 min-h-[2.6em] text-sm font-medium leading-snug text-text group-hover:text-primary">
          {listing.title}
        </p>

        {listing.fits !== undefined && (
          <span
            className={`inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold ${
              listing.fits ? "bg-primary-light text-green" : "bg-light text-muted"
            }`}
          >
            {listing.fits ? `✓ Fits your ${fitVehicle ?? "car"}` : `Check fit${fitVehicle ? ` for your ${fitVehicle}` : ""}`}
          </span>
        )}

        <p className="text-lg font-bold tracking-tight text-text">
          {formatPrice(listing.price)}
          <span className="ml-1.5 text-xs font-medium text-muted">{isNew ? "Buy It Now" : "or Best Offer"}</span>
        </p>

        <span className="inline-flex w-fit items-center gap-1 text-xs font-medium text-green">
          <ShieldIcon size={13} /> Escrow protected
        </span>

        <div className="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pt-1 text-xs text-muted">
          {hasRating && (
            <>
              <span className="flex items-center text-gold" aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <StarIcon key={i} size={12} />
                ))}
              </span>
              <span className="font-medium text-text">{seller.rating!.toFixed(1)}</span>
              <span>({seller.ratingCount.toLocaleString()})</span>
              <span aria-hidden className="h-1 w-1 rounded-full bg-border" />
            </>
          )}
          {seller.verified && (
            <>
              <span className="font-medium text-primary">Verified</span>
              <span aria-hidden className="h-1 w-1 rounded-full bg-border" />
            </>
          )}
          <span>{listing.city}</span>
        </div>
      </div>
    </Link>
  );
}
