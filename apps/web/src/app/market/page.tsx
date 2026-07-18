"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { market, ApiError, type MarketBrowseResult, type MarketCategory } from "@/lib/api";
import { buildMarketQuery } from "@/lib/marketQuery";
import { Select } from "@/components/ui/Select";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterSidebar } from "@/components/market/FilterSidebar";
import { ListingCard } from "@/components/market/ListingCard";
import { useMarketNav } from "@/components/market/useMarketNav";

const SORT_OPTIONS = [
  { value: "newest", label: "Best match" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

function Browse() {
  const { params, navigate } = useMarketNav();
  const [result, setResult] = useState<MarketBrowseResult | null>(null);
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryKey = buildMarketQuery(params);

  useEffect(() => {
    market.categories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await market.browse(params);
        if (!ignore) setResult(res);
      } catch (err) {
        if (!ignore) setError(err instanceof ApiError ? err.message : "Couldn't load listings right now.");
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryKey is the serialized form of params
  }, [queryKey]);

  const heading = useMemo(() => {
    if (params.q) return `“${params.q}”`;
    const cat = categories.find(c => c.id === params.categoryIds?.[0]);
    return cat ? cat.name : "All parts";
  }, [params.q, params.categoryIds, categories]);

  const total = result?.total ?? 0;
  const page = params.page ?? 1;

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6">
      <div className="flex gap-7">
        <FilterSidebar categories={categories} />

        <section className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-text">
                {heading}{" "}
                {!loading && <span className="text-sm font-normal text-muted">· {total.toLocaleString()} results</span>}
              </h1>
              {params.modelId && (
                <p className="mt-0.5 text-sm font-medium text-green">✓ Filtered to parts that fit your vehicle</p>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted">
              <span className="hidden sm:inline">Sort</span>
              <div className="w-52">
                <Select
                  value={params.sort ?? "newest"}
                  onValueChange={v => navigate({ sort: v as never })}
                  options={SORT_OPTIONS}
                />
              </div>
            </div>
          </div>

          {error && <Alert tone="error">{error}</Alert>}

          {loading && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <Skeleton className="aspect-[4/3] w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              ))}
            </div>
          )}

          {!loading && !error && result && result.data.length === 0 && (
            <EmptyState
              icon={<span className="text-3xl">🔧</span>}
              title="No parts match your filters"
              description="Try widening the price range, clearing your garage vehicle, or a different search term."
            />
          )}

          {!loading && !error && result && result.data.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {result.data.map(listing => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>

              {(page > 1 || result.hasMore) && (
                <div className="mt-8 flex items-center justify-center gap-3">
                  <button
                    onClick={() => navigate({ page: page - 1 })}
                    disabled={page <= 1}
                    className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:border-primary hover:text-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-muted">Page {page}</span>
                  <button
                    onClick={() => navigate({ page: page + 1 })}
                    disabled={!result.hasMore}
                    className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:border-primary hover:text-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default function MarketBrowsePage() {
  return (
    <Suspense>
      <Browse />
    </Suspense>
  );
}
