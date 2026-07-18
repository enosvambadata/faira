"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { market, type MarketCategory, type MarketVehicleMake, type MarketVehicleModel } from "@/lib/api";
import { Select } from "@/components/ui/Select";
import { useMarketNav } from "./useMarketNav";
import { SearchIcon, HeartIcon, CartIcon, CarIcon } from "./icons";

const YEARS = Array.from({ length: 2027 - 1990 + 1 }, (_, i) => String(2027 - i));

export function MarketChrome() {
  const { params, navigate } = useMarketNav();

  const [term, setTerm] = useState(params.q ?? "");
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [makes, setMakes] = useState<MarketVehicleMake[]>([]);
  const [models, setModels] = useState<MarketVehicleModel[]>([]);
  const [makeId, setMakeId] = useState<string | undefined>();
  const [modelId, setModelId] = useState<string | undefined>();
  const [year, setYear] = useState<string | undefined>();

  // Chrome fetches its own reference data once (the layout persists across
  // browse navigations, so this doesn't refire on every filter change).
  useEffect(() => {
    market.categories().then(setCategories).catch(() => setCategories([]));
    market.makes().then(setMakes).catch(() => setMakes([]));
  }, []);

  useEffect(() => {
    if (!makeId) return;
    let ignore = false;
    market
      .models(makeId)
      .then(m => {
        if (!ignore) setModels(m);
      })
      .catch(() => {
        if (!ignore) setModels([]);
      });
    return () => {
      ignore = true;
    };
  }, [makeId]);

  // Reset the dependent model when the make changes — done in the handler
  // rather than an effect so there's no cascading synchronous setState.
  const changeMake = (value: string) => {
    setMakeId(value);
    setModelId(undefined);
    setModels([]);
  };

  const activeVehicle = useMemo(() => {
    if (!params.modelId) return null;
    const modelName = models.find(m => m.id === params.modelId)?.name;
    const makeName = makes.find(m => m.id === makeId)?.name;
    const label = [makeName, modelName].filter(Boolean).join(" ");
    return `${label || "your vehicle"}${params.year ? ` · ${params.year}` : ""}`;
  }, [params.modelId, params.year, models, makes, makeId]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ q: term.trim() || undefined });
  };

  const applyGarage = () => {
    if (!modelId) return;
    navigate({ modelId, year: year ? Number(year) : undefined });
  };

  const clearGarage = () => {
    setMakeId(undefined);
    setModelId(undefined);
    setYear(undefined);
    navigate({ modelId: undefined, year: undefined });
  };

  const activeCategory = params.categoryIds?.[0];

  return (
    <div className="border-b border-border bg-white">
      {/* utility strip */}
      <div className="border-b border-border">
        <div className="mx-auto flex h-9 max-w-[1280px] items-center justify-between px-4 text-xs text-muted sm:px-6">
          <nav className="flex gap-4">
            <Link href="/market" className="hover:text-primary">Daily deals</Link>
            <Link href="/market" className="hidden hover:text-primary sm:inline">Sell a part</Link>
            <Link href="/market" className="hidden hover:text-primary sm:inline">Help</Link>
          </nav>
          <span>Ship to 🇿🇼 Zimbabwe</span>
        </div>
      </div>

      {/* masthead */}
      <div className="mx-auto flex max-w-[1280px] items-center gap-5 px-4 py-3 sm:px-6">
        <Link href="/market" className="flex shrink-0 items-baseline gap-1.5">
          <span className="text-2xl font-extrabold tracking-tight text-dark">
            fa<span className="text-primary">i</span>ra
          </span>
          <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
            Parts
          </span>
        </Link>

        <form onSubmit={submitSearch} className="flex h-11 flex-1 items-stretch overflow-hidden rounded-full border-2 border-dark bg-white">
          <input
            value={term}
            onChange={e => setTerm(e.target.value)}
            placeholder="Search parts — e.g. Vitz brake pads, 2NZ engine"
            aria-label="Search parts"
            className="min-w-0 flex-1 bg-transparent px-4 text-[15px] text-text outline-none placeholder:text-muted"
          />
          <button type="submit" className="flex items-center gap-1.5 bg-primary px-6 font-semibold text-white transition-colors hover:bg-primary-dark">
            <SearchIcon size={18} />
            <span className="hidden sm:inline">Search</span>
          </button>
        </form>

        <nav className="flex shrink-0 items-center gap-4 text-muted">
          <Link href="/market" aria-label="Watchlist" className="flex flex-col items-center gap-0.5 text-[10px] hover:text-primary">
            <HeartIcon size={21} />
            <span className="hidden md:inline">Watchlist</span>
          </Link>
          <Link href="/market" aria-label="Cart" className="flex flex-col items-center gap-0.5 text-[10px] hover:text-primary">
            <CartIcon size={21} />
            <span className="hidden md:inline">Cart</span>
          </Link>
        </nav>
      </div>

      {/* garage bar */}
      <div className="bg-light">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
          <span className="flex items-center gap-2 font-semibold text-text">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-green">
              <CarIcon size={17} />
            </span>
            My Garage
          </span>

          {activeVehicle ? (
            <span className="flex items-center gap-2 rounded-full border border-green bg-white px-3 py-1 text-sm font-medium text-green">
              ✓ Showing parts for {activeVehicle}
              <button onClick={clearGarage} className="font-semibold underline-offset-2 hover:underline">Clear</button>
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-36">
                <Select value={makeId} onValueChange={changeMake} placeholder="Make" options={makes.map(m => ({ value: m.id, label: m.name }))} />
              </div>
              <div className="w-40">
                <Select value={modelId} onValueChange={setModelId} placeholder="Model" options={models.map(m => ({ value: m.id, label: m.name }))} disabled={!makeId} />
              </div>
              <div className="w-28">
                <Select value={year} onValueChange={setYear} placeholder="Year" options={YEARS.map(y => ({ value: y, label: y }))} />
              </div>
              <button
                onClick={applyGarage}
                disabled={!modelId}
                className="h-11 rounded-md bg-dark px-4 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-40"
              >
                Find parts that fit
              </button>
            </div>
          )}
        </div>
      </div>

      {/* category chips */}
      <div className="mx-auto flex max-w-[1280px] items-center gap-2 overflow-x-auto px-4 py-2.5 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          onClick={() => navigate({ categoryIds: [] })}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
            !activeCategory ? "border-dark bg-dark text-white" : "border-border text-muted hover:border-primary hover:text-primary"
          }`}
        >
          All categories
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => navigate({ categoryIds: [cat.id] })}
            className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              activeCategory === cat.id ? "border-dark bg-dark text-white" : "border-border text-muted hover:border-primary hover:text-primary"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>
    </div>
  );
}
