// Small inline icons for the marketplace storefront — the shared UI icon set
// (components/ui/icons) doesn't carry commerce glyphs (search, cart, heart…).
import { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...props }: P) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export const SearchIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const HeartIcon = ({ filled, ...p }: P & { filled?: boolean }) => (
  <svg {...base(p)} fill={filled ? "currentColor" : "none"}>
    <path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 22l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
  </svg>
);

export const CartIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 4h2l2.4 12.2a1.6 1.6 0 0 0 1.6 1.3h8.7a1.6 1.6 0 0 0 1.6-1.2L22 8H6" />
    <circle cx="9.5" cy="20.5" r="1.2" />
    <circle cx="18" cy="20.5" r="1.2" />
  </svg>
);

export const CarIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" />
    <path d="M3 11h18v5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1H6.5v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5Z" />
    <path d="M6.5 14h.01M17.5 14h.01" />
  </svg>
);

export const ShieldIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 2 4 5v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V5l-8-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const StarIcon = ({ filled = true, ...p }: P & { filled?: boolean }) => (
  <svg {...base({ ...p, strokeWidth: 1 })} fill={filled ? "currentColor" : "none"}>
    <path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.8 6.8 19l1-5.8L3.5 9.2l5.9-.9L12 3Z" />
  </svg>
);
