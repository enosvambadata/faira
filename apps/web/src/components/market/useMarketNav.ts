"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { parseMarketParams, mergeMarketParams, buildMarketQuery, type MarketBrowseParams } from "@/lib/marketQuery";

// Single source of truth for storefront filter state: the URL. Every control
// (search box, garage, category chips, sidebar filters, sort, pagination)
// reads the current params and navigates by patching them; the browse page
// re-fetches whenever the query string changes.
export function useMarketNav() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = parseMarketParams(searchParams);

  const navigate = (patch: Partial<MarketBrowseParams>) => {
    const next = mergeMarketParams(params, patch);
    router.push(`/market${buildMarketQuery(next)}`);
  };

  return { params, navigate };
}
