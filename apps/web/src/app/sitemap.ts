import type { MetadataRoute } from "next";

const API = process.env.NEXT_PUBLIC_API_URL;
// Public marketplace origin. Set NEXT_PUBLIC_SITE_URL at go-live; the fallback
// is a placeholder so builds don't fail before the domain exists.
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://market.vambadata.com";

// Regenerate the sitemap hourly so new listings show up for crawlers without
// a redeploy.
export const revalidate = 3600;

const MAX_PAGES = 50; // bound the crawl (≈1000 listings at PAGE_SIZE 20)

async function activeListings(): Promise<{ id: string; createdAt?: string }[]> {
  const out: { id: string; createdAt?: string }[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      const res = await fetch(`${API}/api/v1/listings?page=${page}`, { next: { revalidate: 3600 } });
      if (!res.ok) break;
      const json = await res.json();
      for (const l of json.data ?? []) out.push({ id: l.id, createdAt: l.createdAt });
      if (!json.hasMore) break;
    } catch {
      break;
    }
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const listings = await activeListings();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/market`, changeFrequency: "daily", priority: 0.8 },
  ];

  const listingRoutes: MetadataRoute.Sitemap = listings.map(l => ({
    url: `${SITE}/market/listings/${l.id}`,
    lastModified: l.createdAt ? new Date(l.createdAt) : undefined,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...listingRoutes];
}
