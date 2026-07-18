"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { marketWatchlist } from "@/lib/api";
import { useMarketAuth } from "./useMarketAuth";

interface WatchlistContextValue {
  isSaved: (listingId: string) => boolean;
  toggle: (listingId: string) => void;
  count: number;
  signedIn: boolean;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

// Shares saved-listing state across every card and the watchlist page, so a
// heart toggled in the grid is reflected everywhere without a refetch. Saved
// ids are loaded once per sign-in; toggles are optimistic.
export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const { signedIn } = useMarketAuth();
  const router = useRouter();
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      if (!signedIn) {
        setIds(new Set());
        return;
      }
      try {
        const list = await marketWatchlist.ids();
        if (!ignore) setIds(new Set(list));
      } catch {
        /* a failed load just leaves hearts empty; toggling still works */
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [signedIn]);

  const isSaved = useCallback((listingId: string) => ids.has(listingId), [ids]);

  const toggle = useCallback(
    (listingId: string) => {
      if (!signedIn) {
        router.push("/login?next=/market");
        return;
      }
      const saving = !ids.has(listingId);
      // Optimistic: update the UI first, reconcile on failure.
      setIds(prev => {
        const next = new Set(prev);
        if (saving) next.add(listingId);
        else next.delete(listingId);
        return next;
      });
      const call = saving ? marketWatchlist.add(listingId) : marketWatchlist.remove(listingId);
      call.catch(() => {
        setIds(prev => {
          const next = new Set(prev);
          if (saving) next.delete(listingId);
          else next.add(listingId);
          return next;
        });
      });
    },
    [ids, signedIn, router],
  );

  return (
    <WatchlistContext.Provider value={{ isSaved, toggle, count: ids.size, signedIn }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist(): WatchlistContextValue {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error("useWatchlist must be used within a WatchlistProvider");
  return ctx;
}
