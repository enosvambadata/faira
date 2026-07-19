"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  market,
  marketGarage,
  type MarketCategory,
  type MarketVehicleMake,
  type MarketVehicleModel,
  type MarketGarageVehicle,
} from "@/lib/api";
import { partsCategories } from "@/lib/marketCategories";
import { Select } from "@/components/ui/Select";
import { useMarketNav } from "./useMarketNav";
import { useMarketAuth, signOutFromMarket } from "./useMarketAuth";
import { SearchIcon, HeartIcon, CartIcon, CarIcon, MessageIcon } from "./icons";

const YEARS = Array.from({ length: 2027 - 1990 + 1 }, (_, i) => String(2027 - i));

export function MarketChrome() {
  const { params, navigate } = useMarketNav();
  const { signedIn } = useMarketAuth();

  const [term, setTerm] = useState(params.q ?? "");
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [makes, setMakes] = useState<MarketVehicleMake[]>([]);
  const [models, setModels] = useState<MarketVehicleModel[]>([]);
  const [makeId, setMakeId] = useState<string | undefined>();
  const [modelId, setModelId] = useState<string | undefined>();
  const [year, setYear] = useState<string | undefined>();
  const [garageVehicles, setGarageVehicles] = useState<MarketGarageVehicle[]>([]);

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

  // Saved garage vehicles load per sign-in (and clear on sign-out). Both
  // setState calls live inside the nested async fn, not the effect body.
  useEffect(() => {
    let ignore = false;
    const load = async () => {
      if (!signedIn) {
        setGarageVehicles([]);
        return;
      }
      try {
        const v = await marketGarage.list();
        if (!ignore) setGarageVehicles(v);
      } catch {
        /* leave the garage empty on a failed load */
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [signedIn]);

  // Reset the dependent model when the make changes — done in the handler
  // rather than an effect so there's no cascading synchronous setState.
  const changeMake = (value: string) => {
    setMakeId(value);
    setModelId(undefined);
    setModels([]);
  };

  const saveVehicle = async () => {
    if (!modelId) return;
    try {
      const v = await marketGarage.add(modelId, year ? Number(year) : undefined);
      setGarageVehicles(prev => [v, ...prev.filter(x => x.id !== v.id)]);
    } catch {
      /* ignore — the filter still works even if the save didn't stick */
    }
  };

  const removeVehicle = async (id: string) => {
    try {
      await marketGarage.remove(id);
      setGarageVehicles(prev => prev.filter(x => x.id !== id));
    } catch {
      /* ignore */
    }
  };

  const handleSignOut = async () => {
    await signOutFromMarket();
  };

  // The active garage vehicle drives the fits annotation (fitFor), so the grid
  // shows every part but marks which fit. The separate "only show parts that
  // fit" toggle layers on the actual fitment filter (modelId).
  const activeVehicle = useMemo(() => {
    if (!params.fitFor) return null;
    const saved = garageVehicles.find(v => v.modelId === params.fitFor);
    const modelName = saved?.model ?? models.find(m => m.id === params.fitFor)?.name;
    const makeName = saved?.make ?? makes.find(m => m.id === makeId)?.name;
    const label = [makeName, modelName].filter(Boolean).join(" ");
    return `${label || "your vehicle"}${params.fitYear ? ` · ${params.fitYear}` : ""}`;
  }, [params.fitFor, params.fitYear, models, makes, makeId, garageVehicles]);

  const onlyFits = !!params.modelId;
  const toggleOnlyFits = () => {
    if (onlyFits) navigate({ modelId: undefined, year: undefined });
    else navigate({ modelId: params.fitFor, year: params.fitYear });
  };

  // Whether the currently selected make/model is already saved (avoids
  // offering "Save" for a vehicle that's already in the garage).
  const alreadySaved = !!modelId && garageVehicles.some(v => v.modelId === modelId);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ q: term.trim() || undefined });
  };

  const applyGarage = () => {
    if (!modelId) return;
    const label = models.find(m => m.id === modelId)?.name;
    navigate({ fitFor: modelId, fitYear: year ? Number(year) : undefined, fitLabel: label });
  };

  const clearGarage = () => {
    setMakeId(undefined);
    setModelId(undefined);
    setYear(undefined);
    navigate({ fitFor: undefined, fitYear: undefined, fitLabel: undefined, modelId: undefined, year: undefined });
  };

  const activeCategory = params.categoryIds?.[0];
  const partCats = partsCategories(categories);

  return (
    <div className="border-b border-border bg-white">
      {/* utility strip */}
      <div className="border-b border-border">
        <div className="mx-auto flex h-9 max-w-[1280px] items-center justify-between px-4 text-xs text-muted sm:px-6">
          <nav className="flex gap-4">
            <Link href="/market" className="hover:text-primary">Daily deals</Link>
            <Link href="/market/sell" className="hover:text-primary">Sell a part</Link>
            <Link href="/market" className="hidden hover:text-primary sm:inline">Help</Link>
          </nav>
          <div className="flex items-center gap-4">
            {signedIn ? (
              <>
                <Link href="/market/account" className="font-medium text-primary hover:underline">Your shop</Link>
                <button onClick={handleSignOut} className="hover:text-primary">Sign out</button>
              </>
            ) : (
              <>
                <Link href="/signup?redirect=/market" className="hover:text-primary">Register</Link>
                <Link href="/login?next=/market" className="font-medium text-primary hover:underline">Sign in</Link>
              </>
            )}
            <span className="hidden sm:inline">Ship to 🇿🇼 Zimbabwe</span>
          </div>
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
          <Link href="/market/messages" aria-label="Messages" className="flex flex-col items-center gap-0.5 text-[10px] hover:text-primary">
            <MessageIcon size={21} />
            <span className="hidden md:inline">Messages</span>
          </Link>
          <Link href="/market/watchlist" aria-label="Watchlist" className="flex flex-col items-center gap-0.5 text-[10px] hover:text-primary">
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
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 rounded-full border border-green bg-white px-3 py-1 text-sm font-medium text-green">
                🚗 {activeVehicle}
                <button onClick={clearGarage} className="font-semibold underline-offset-2 hover:underline">Change</button>
              </span>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
                Only show parts that fit
                <button
                  type="button"
                  role="switch"
                  aria-checked={onlyFits}
                  onClick={toggleOnlyFits}
                  className={`relative h-5 w-9 rounded-full transition-colors ${onlyFits ? "bg-green" : "bg-border"}`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${onlyFits ? "translate-x-4" : "translate-x-0.5"}`}
                  />
                </button>
              </label>
            </div>
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
              {signedIn && modelId && !alreadySaved && (
                <button
                  onClick={saveVehicle}
                  className="h-11 rounded-md border border-primary px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary-light"
                >
                  Save to garage
                </button>
              )}
            </div>
          )}

          {/* saved vehicles — quick-apply chips */}
          {signedIn && garageVehicles.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {garageVehicles.map(v => {
                const isActive = params.fitFor === v.modelId;
                return (
                  <span
                    key={v.id}
                    className={`flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-xs font-medium ${
                      isActive ? "border-green text-green" : "border-border text-muted"
                    }`}
                  >
                    <button
                      onClick={() => navigate({ fitFor: v.modelId, fitYear: v.year ?? undefined, fitLabel: v.model })}
                      className="hover:text-primary"
                    >
                      {v.make} {v.model}
                      {v.year ? ` ${v.year}` : ""}
                    </button>
                    <button
                      onClick={() => removeVehicle(v.id)}
                      aria-label={`Remove ${v.make} ${v.model} from garage`}
                      className="text-muted hover:text-red"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {!signedIn && (
            <Link href="/login?next=/market" className="text-xs font-medium text-primary hover:underline">
              Sign in to save your garage
            </Link>
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
        {partCats.map(cat => (
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
