"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { marketMessages, ApiError } from "@/lib/api";
import { useMarketAuth } from "./useMarketAuth";

// Client island: the auth-dependent actions (Buy It Now, Message the seller).
// Rendered inside the server-rendered listing page.
export function ListingActions({ listingId, sellerId }: { listingId: string; sellerId: string }) {
  const router = useRouter();
  const { userId, signedIn } = useMarketAuth();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sellerId === userId) {
    return <p className="text-center text-sm text-muted">This is your listing.</p>;
  }

  const messageSeller = async () => {
    if (!signedIn) {
      router.push(`/login?next=/market/listings/${listingId}`);
      return;
    }
    setStarting(true);
    try {
      const conv = await marketMessages.start(listingId);
      router.push(`/market/messages/${conv.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start a conversation.");
      setStarting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Link
        href={`/market/listings/${listingId}/checkout`}
        className="grid h-12 place-items-center rounded-full bg-primary font-semibold text-white transition-colors hover:bg-primary-dark"
      >
        Buy It Now
      </Link>
      <button
        onClick={messageSeller}
        disabled={starting}
        className="grid h-12 place-items-center rounded-full border border-primary font-semibold text-primary transition-colors hover:bg-primary-light disabled:opacity-50"
      >
        {starting ? "…" : "Message seller"}
      </button>
      {error && <p className="text-center text-xs text-red">{error}</p>}
    </div>
  );
}
