"use client";

import { useEffect, useState } from "react";
import { market, type MarketCategory } from "@/lib/api";
import { MARKET_CONDITIONS, type MarketCondition } from "@/lib/marketQuery";
import { useMarketNav } from "./useMarketNav";

const CONDITION_LABELS: Record<MarketCondition, string> = {
  NEW: "New",
  LIKE_NEW: "Like new",
  GOOD: "Good",
  FAIR: "For parts / fair",
};

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border py-4 first:pt-0">
      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </div>
  );
}

export function FilterSidebar({ categories }: { categories: MarketCategory[] }) {
  const { params, navigate } = useMarketNav();
  const [min, setMin] = useState(params.minPrice?.toString() ?? "");
  const [max, setMax] = useState(params.maxPrice?.toString() ?? "");
  const [cities, setCities] = useState<string[]>([]);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const opts = await market.filterOptions();
        if (!ignore) setCities(opts.cities);
      } catch {
        /* leave location filter empty on failure */
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, []);

  const toggleCondition = (c: MarketCondition) => {
    const set = new Set(params.conditions ?? []);
    if (set.has(c)) set.delete(c);
    else set.add(c);
    navigate({ conditions: [...set] });
  };

  const toggleCity = (city: string) => {
    const set = new Set(params.cities ?? []);
    if (set.has(city)) set.delete(city);
    else set.add(city);
    navigate({ cities: [...set] });
  };

  const applyPrice = () => {
    navigate({
      minPrice: min.trim() === "" ? undefined : Number(min),
      maxPrice: max.trim() === "" ? undefined : Number(max),
    });
  };

  const activeCategory = params.categoryIds?.[0];

  return (
    <aside className="hidden w-[230px] shrink-0 lg:block">
      <Group title="Category">
        <ul className="flex flex-col gap-1.5 text-sm">
          <li>
            <button
              onClick={() => navigate({ categoryIds: [] })}
              className={`text-left transition-colors hover:text-primary ${!activeCategory ? "font-semibold text-primary" : "text-muted"}`}
            >
              All categories
            </button>
          </li>
          {categories.map(cat => (
            <li key={cat.id}>
              <button
                onClick={() => navigate({ categoryIds: [cat.id] })}
                className={`flex items-center gap-2 text-left transition-colors hover:text-primary ${activeCategory === cat.id ? "font-semibold text-primary" : "text-muted"}`}
              >
                {cat.icon && <span aria-hidden>{cat.icon}</span>}
                {cat.name}
              </button>
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Condition">
        <ul className="flex flex-col gap-2 text-sm">
          {MARKET_CONDITIONS.map(c => (
            <li key={c}>
              <label className="flex cursor-pointer items-center gap-2.5 text-muted">
                <input
                  type="checkbox"
                  checked={params.conditions?.includes(c) ?? false}
                  onChange={() => toggleCondition(c)}
                  className="h-4 w-4 accent-primary"
                />
                {CONDITION_LABELS[c]}
              </label>
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Price (USD)">
        <div className="flex items-center gap-2">
          <input
            value={min}
            onChange={e => setMin(e.target.value)}
            onKeyDown={e => e.key === "Enter" && applyPrice()}
            inputMode="numeric"
            placeholder="Min"
            aria-label="Minimum price"
            className="w-full rounded-md border border-border bg-white px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
          />
          <span className="text-muted">–</span>
          <input
            value={max}
            onChange={e => setMax(e.target.value)}
            onKeyDown={e => e.key === "Enter" && applyPrice()}
            inputMode="numeric"
            placeholder="Max"
            aria-label="Maximum price"
            className="w-full rounded-md border border-border bg-white px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
          />
        </div>
        <button
          onClick={applyPrice}
          className="mt-2.5 w-full rounded-md border border-primary py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary-light"
        >
          Apply
        </button>
      </Group>

      {cities.length > 0 && (
        <Group title="Location">
          <ul className="flex flex-col gap-2 text-sm">
            {cities.map(city => (
              <li key={city}>
                <label className="flex cursor-pointer items-center gap-2.5 text-muted">
                  <input
                    type="checkbox"
                    checked={params.cities?.includes(city) ?? false}
                    onChange={() => toggleCity(city)}
                    className="h-4 w-4 accent-primary"
                  />
                  {city}
                </label>
              </li>
            ))}
          </ul>
        </Group>
      )}
    </aside>
  );
}
