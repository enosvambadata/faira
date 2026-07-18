"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

// Lightweight session awareness for the storefront: are we signed in, and as
// whom. Marketplace data itself goes through apps/api (Bearer token); this
// only reads Supabase session state to gate the garage/watchlist UI.
export function useMarketAuth() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined); // undefined = still loading

  useEffect(() => {
    const supabase = createClient();
    let ignore = false;

    supabase.auth.getSession().then(({ data }) => {
      if (!ignore) setUserId(data.session?.user?.id ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      ignore = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { userId: userId ?? null, loading: userId === undefined, signedIn: !!userId };
}

export async function signOutFromMarket() {
  await createClient().auth.signOut();
}
