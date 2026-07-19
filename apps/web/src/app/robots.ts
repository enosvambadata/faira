import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://market.vambadata.com";

// Let crawlers index public marketplace pages; keep auth, user-private, and
// operator/back-office routes out of the index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/login",
        "/signup",
        "/market/messages",
        "/market/watchlist",
        "/market/sell",
        "/market/listings/*/checkout",
        "/collect-uk/dispatch",
        "/hub-ops",
        "/dashboard",
        "/profile",
        "/notifications",
      ],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
