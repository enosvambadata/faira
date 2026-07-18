import Link from "next/link";
import { type MarketListingSummary } from "@/lib/api";
import { ShieldIcon } from "./icons";
import { WatchlistHeart } from "./WatchlistHeart";

function formatPrice(price: string): string {
  const n = Number(price);
  if (!Number.isFinite(n)) return `$${price}`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// eBay-style product card: photo-forward, bold price, trust signal. Kept
// deliberately dense so a grid of them scans quickly.
export function ListingCard({ listing }: { listing: MarketListingSummary }) {
  return (
    <Link
      href={`/market/listings/${listing.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-white shadow-[var(--shadow-card)] transition-shadow duration-200 hover:shadow-modal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-light">
        {listing.imageUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element -- seller photos are arbitrary Cloudinary URLs; next/image remote config is deferred to a later slice
          <img
            src={listing.imageUrls[0]}
            alt={listing.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl text-muted">🔧</div>
        )}
        <div className="absolute right-2.5 top-2.5">
          <WatchlistHeart listingId={listing.id} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="line-clamp-2 min-h-[2.6em] text-sm font-medium leading-snug text-text group-hover:text-primary">
          {listing.title}
        </p>
        <p className="text-lg font-bold tracking-tight text-text">{formatPrice(listing.price)}</p>
        <div className="mt-auto flex items-center gap-2 pt-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1 font-medium text-green">
            <ShieldIcon size={13} /> Escrow
          </span>
          <span aria-hidden className="h-1 w-1 rounded-full bg-border" />
          <span>{listing.city}</span>
        </div>
      </div>
    </Link>
  );
}
