import { type MarketCategory } from "./api";

// The auto-parts vertical's top-level categories, in display order. The API
// still returns the legacy general-marketplace categories (fashion,
// electronics, beauty…) that predate the pivot; the storefront shows only
// these so it reads as a pure car-parts marketplace. See
// docs/marketplace/00-vehicle-fitment-spec.md and the pivot note.
export const PARTS_TOP_LEVEL_SLUGS = [
  "engines-drivetrain",
  "suspension-steering",
  "brakes",
  "body-exterior",
  "electrical-ignition",
  "interior-accessories",
  "service-maintenance",
  "wheels-tyres",
  "exhaust-emissions",
  "whole-vehicles",
] as const;

const ORDER = new Map<string, number>(PARTS_TOP_LEVEL_SLUGS.map((s, i) => [s, i]));

// Keep only the auto-parts top-level categories, in the canonical order above.
export function partsCategories(categories: MarketCategory[]): MarketCategory[] {
  return categories.filter(c => ORDER.has(c.slug)).sort((a, b) => ORDER.get(a.slug)! - ORDER.get(b.slug)!);
}
