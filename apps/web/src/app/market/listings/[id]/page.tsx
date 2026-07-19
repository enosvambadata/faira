import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { MarketListingDetail } from "@/lib/api";
import { ShieldIcon } from "@/components/market/icons";
import { Check } from "@/components/ui/icons";
import { ListingGallery } from "@/components/market/ListingGallery";
import { ListingActions } from "@/components/market/ListingActions";

const API = process.env.NEXT_PUBLIC_API_URL;

const CONDITION_LABELS: Record<string, string> = {
  NEW: "New",
  LIKE_NEW: "Like new",
  GOOD: "Good — used",
  FAIR: "For parts / fair",
};

// Public listing detail — fetched on the server (no auth) so the HTML is fully
// rendered for crawlers. Interactive bits are client islands (gallery, actions).
async function getListing(id: string): Promise<MarketListingDetail | null> {
  try {
    const res = await fetch(`${API}/api/v1/listings/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()).data as MarketListingDetail) ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const l = await getListing(id);
  if (!l) return { title: "Part not found — Faira Parts" };

  const title = `${l.title} — $${l.price} | Faira Parts`;
  const description = (l.description ?? `${l.title} for sale in ${l.city}. Escrow-protected car parts on Faira.`).slice(0, 160);
  const image = l.imageUrls[0];

  return {
    title,
    description,
    openGraph: { title, description, type: "website", images: image ? [image] : [] },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : [] },
  };
}

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) notFound();

  const price = Number(listing.price);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.title,
    description: listing.description ?? undefined,
    image: listing.imageUrls,
    category: listing.category?.name,
    offers: {
      "@type": "Offer",
      price: listing.price,
      priceCurrency: "USD",
      availability: listing.status === "ACTIVE" ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      itemCondition: listing.condition === "NEW" ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition",
    },
  };

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Link href="/market" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-primary">
        ← Back to results
      </Link>

      <div className="grid gap-8 md:grid-cols-2">
        <ListingGallery images={listing.imageUrls} title={listing.title} />

        <div className="flex flex-col gap-4">
          <div>
            {listing.category && (
              <Link
                href={`/market?categoryIds=${listing.category.id}`}
                className="text-xs font-semibold uppercase tracking-wide text-primary hover:underline"
              >
                {listing.category.name}
              </Link>
            )}
            <h1 className="mt-1 text-2xl font-bold leading-snug tracking-tight text-text">{listing.title}</h1>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-3xl font-extrabold tracking-tight text-text">${price.toLocaleString()}</span>
            <span className="rounded-md bg-primary-light px-2.5 py-1 text-xs font-semibold text-primary-dark">
              {CONDITION_LABELS[listing.condition] ?? listing.condition}
            </span>
          </div>

          <div className="rounded-lg border border-border bg-white p-4">
            <ListingActions listingId={listing.id} sellerId={listing.seller.id} />
            <div className="mt-4 flex items-start gap-2 border-t border-border pt-3 text-sm">
              <ShieldIcon size={18} className="text-green" />
              <p className="text-muted">
                <span className="font-semibold text-green">Escrow protected.</span> Your payment is held until you
                confirm the part arrived as described.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border bg-white p-4">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-primary-light font-bold text-primary">
              {(listing.seller.displayName ?? "S").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-semibold text-text">
                {listing.seller.displayName ?? "Faira seller"}
                {listing.seller.isVerified && (
                  <span className="inline-flex items-center gap-0.5 text-xs font-medium text-primary">
                    <Check size={13} /> Verified
                  </span>
                )}
              </p>
              {listing.seller.city && <p className="text-sm text-muted">{listing.seller.city}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        {listing.description && (
          <div>
            <h2 className="mb-2 text-lg font-semibold text-text">Description</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{listing.description}</p>
          </div>
        )}
        {Object.keys(listing.attributes).length > 0 && (
          <div>
            <h2 className="mb-2 text-lg font-semibold text-text">Item specifics</h2>
            <dl className="divide-y divide-border rounded-lg border border-border bg-white text-sm">
              {Object.entries(listing.attributes).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="capitalize text-muted">{k}</dt>
                  <dd className="font-medium text-text">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
