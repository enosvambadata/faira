import { Package } from "@/components/ui/icons";

// Shared Faira Collect brand lockup for portal/driver/public headers so
// every Collect UK surface carries the same mark (design system: navy
// square + Poppins wordmark, product area as a muted suffix).
export function CollectBrand({ suffix }: { suffix?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-dark text-white">
        <Package size={17} />
      </span>
      <span className="text-lg font-semibold text-text">
        Faira Collect
        {suffix && <span className="font-normal text-muted"> — {suffix}</span>}
      </span>
    </span>
  );
}
