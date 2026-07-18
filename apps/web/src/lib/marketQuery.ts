// Pure helpers for the marketplace storefront's URL <-> query state. The URL
// is the single source of truth: the chrome (search, garage, category chips)
// and the filter sidebar all read/write these params, and the browse page
// re-fetches whenever they change. Kept dependency-free so it's unit-testable
// without pulling in the Supabase client that api.ts loads at import time.

export const MARKET_SORTS = ["newest", "price_asc", "price_desc"] as const;
export type MarketSort = (typeof MARKET_SORTS)[number];

export const MARKET_CONDITIONS = ["NEW", "LIKE_NEW", "GOOD", "FAIR"] as const;
export type MarketCondition = (typeof MARKET_CONDITIONS)[number];

export interface MarketBrowseParams {
  page?: number;
  q?: string;
  sort?: MarketSort;
  categoryIds?: string[];
  conditions?: MarketCondition[];
  cities?: string[];
  minPrice?: number;
  maxPrice?: number;
  // Filter: only parts that fit this model/year ("only show parts that fit").
  modelId?: string;
  year?: number;
  // Annotate (garage vehicle): keep all results but flag which ones fit.
  fitFor?: string;
  fitYear?: number;
  // Display-only label for the garage vehicle (e.g. "Toyota Vitz") so cards
  // can say "Fits your Vitz". Carried in the URL; the API ignores it.
  fitLabel?: string;
}

function csv(value: string | null): string[] {
  return value ? value.split(",").map(v => v.trim()).filter(Boolean) : [];
}

function num(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// Read a URLSearchParams (or anything with .get) into typed browse params.
export function parseMarketParams(sp: { get(key: string): string | null }): MarketBrowseParams {
  const sort = sp.get("sort");
  const conditions = csv(sp.get("conditions")).filter((c): c is MarketCondition =>
    (MARKET_CONDITIONS as readonly string[]).includes(c),
  );
  return {
    page: num(sp.get("page")) ?? 1,
    q: sp.get("q")?.trim() || undefined,
    sort: (MARKET_SORTS as readonly string[]).includes(sort ?? "") ? (sort as MarketSort) : "newest",
    categoryIds: csv(sp.get("categoryIds")),
    conditions,
    cities: csv(sp.get("cities")),
    minPrice: num(sp.get("minPrice")),
    maxPrice: num(sp.get("maxPrice")),
    modelId: sp.get("modelId") || undefined,
    year: num(sp.get("year")),
    fitFor: sp.get("fitFor") || undefined,
    fitYear: num(sp.get("fitYear")),
    fitLabel: sp.get("fitLabel") || undefined,
  };
}

// Serialize browse params back to a query string for the API call or a link.
// Defaults (page 1, newest sort, empty filters) are omitted so URLs stay clean.
export function buildMarketQuery(p: MarketBrowseParams): string {
  const sp = new URLSearchParams();
  if (p.page && p.page > 1) sp.set("page", String(p.page));
  if (p.q) sp.set("q", p.q);
  if (p.sort && p.sort !== "newest") sp.set("sort", p.sort);
  if (p.categoryIds?.length) sp.set("categoryIds", p.categoryIds.join(","));
  if (p.conditions?.length) sp.set("conditions", p.conditions.join(","));
  if (p.cities?.length) sp.set("cities", p.cities.join(","));
  if (p.minPrice !== undefined) sp.set("minPrice", String(p.minPrice));
  if (p.maxPrice !== undefined) sp.set("maxPrice", String(p.maxPrice));
  if (p.modelId) sp.set("modelId", p.modelId);
  if (p.year !== undefined) sp.set("year", String(p.year));
  if (p.fitFor) sp.set("fitFor", p.fitFor);
  if (p.fitYear !== undefined) sp.set("fitYear", String(p.fitYear));
  if (p.fitLabel) sp.set("fitLabel", p.fitLabel);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// Merge a patch over existing params and reset to page 1 (any filter change
// should start a fresh result set, not keep a now-meaningless page offset).
export function mergeMarketParams(current: MarketBrowseParams, patch: Partial<MarketBrowseParams>): MarketBrowseParams {
  return { ...current, ...patch, page: patch.page ?? 1 };
}
