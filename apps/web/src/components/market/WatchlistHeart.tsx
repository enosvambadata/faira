"use client";

import { HeartIcon } from "./icons";
import { useWatchlist } from "./WatchlistProvider";

// Interactive watchlist toggle. Lives inside the card's <Link>, so it stops
// the click from also navigating to the listing.
export function WatchlistHeart({ listingId, size = 16 }: { listingId: string; size?: number }) {
  const { isSaved, toggle } = useWatchlist();
  const saved = isSaved(listingId);

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? "Remove from watchlist" : "Add to watchlist"}
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        toggle(listingId);
      }}
      className={`grid h-8 w-8 place-items-center rounded-full border bg-white/90 transition-colors ${
        saved ? "border-primary text-primary" : "border-border text-muted hover:text-primary"
      }`}
    >
      <HeartIcon size={size} filled={saved} />
    </button>
  );
}
