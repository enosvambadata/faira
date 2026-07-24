import { Package } from "@/components/ui/icons";

// The company's own brand for customer-facing pages (booking, tracking, pay).
// Falls back to a neutral mark when no logo is set. Uses a plain <img> because
// logo URLs are arbitrary external hosts, not a configured next/image domain.
export function CustomerBrand({ name, logoUrl }: { name?: string | null; logoUrl?: string | null }) {
  return (
    <span className="flex items-center gap-2.5">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-8 w-8 rounded-lg object-contain" />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-dark text-white">
          <Package size={17} />
        </span>
      )}
      <span className="text-lg font-semibold text-text">{name || "Shipping"}</span>
    </span>
  );
}

// Small attribution so the platform stays discoverable without competing with
// the company's brand.
export function PoweredByVamba() {
  return <p className="mt-8 text-center text-xs text-muted">Powered by Vamba Collect</p>;
}
