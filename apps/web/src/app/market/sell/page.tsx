"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  market,
  uploadListingImage,
  ApiError,
  type MarketCategory,
  type MarketVehicleMake,
  type MarketVehicleModel,
  type MarketFitmentInput,
} from "@/lib/api";
import { partsCategories } from "@/lib/marketCategories";
import { Select } from "@/components/ui/Select";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useMarketAuth } from "@/components/market/useMarketAuth";

const CONDITIONS = [
  { value: "NEW", label: "New" },
  { value: "LIKE_NEW", label: "Used — like new" },
  { value: "GOOD", label: "Used — ex-Japan / good" },
  { value: "FAIR", label: "For parts / not working" },
];
const WEIGHT_TIERS = [
  { value: "LIGHT", label: "Light (filters, small electricals)" },
  { value: "MEDIUM", label: "Medium (clutch, radiator, headlight)" },
  { value: "HEAVY", label: "Heavy (engine, gearbox, rims)" },
];
const CITIES = ["Harare", "Bulawayo", "Chitungwiza", "Mutare", "Gweru", "Kwekwe", "Kadoma", "Masvingo", "Victoria Falls", "Beitbridge"];
const DELIVERY_OPTIONS = ["Seller delivers", "Buyer collects", "Courier"];
const YEARS = Array.from({ length: 2027 - 1990 + 1 }, (_, i) => String(2027 - i));
const MAX_PHOTOS = 6;
const DECLARATION = "I confirm that this item was lawfully acquired and that I have the legal right to sell it.";

interface Fitment extends MarketFitmentInput {
  label: string;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text">{label}</span>
      {children}
      {error && <span className="text-xs text-red">{error}</span>}
    </div>
  );
}

export default function SellPage() {
  const router = useRouter();
  const { signedIn, loading: authLoading } = useMarketAuth();

  const [topCats, setTopCats] = useState<MarketCategory[]>([]);
  const [subCats, setSubCats] = useState<MarketCategory[]>([]);
  const [makes, setMakes] = useState<MarketVehicleMake[]>([]);
  const [models, setModels] = useState<MarketVehicleModel[]>([]);

  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [condition, setCondition] = useState<string>();
  const [city, setCity] = useState<string>();
  const [topCat, setTopCat] = useState<string>();
  const [subCat, setSubCat] = useState<string>();
  const [weightTier, setWeightTier] = useState<string>();
  const [delivery, setDelivery] = useState<string[]>(["Seller delivers", "Buyer collects"]);
  const [universalFit, setUniversalFit] = useState(false);
  const [fitments, setFitments] = useState<Fitment[]>([]);
  const [legal, setLegal] = useState(false);

  // fitment picker row
  const [fMake, setFMake] = useState<string>();
  const [fModel, setFModel] = useState<string>();
  const [fFrom, setFFrom] = useState<string>();
  const [fTo, setFTo] = useState<string>();

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    market.categories().then(c => setTopCats(partsCategories(c))).catch(() => setTopCats([]));
    market.makes().then(setMakes).catch(() => setMakes([]));
  }, []);

  useEffect(() => {
    if (!topCat) return;
    let ignore = false;
    market.categories(topCat).then(c => !ignore && setSubCats(c)).catch(() => !ignore && setSubCats([]));
    return () => {
      ignore = true;
    };
  }, [topCat]);

  useEffect(() => {
    if (!fMake) return;
    let ignore = false;
    market.models(fMake).then(m => !ignore && setModels(m)).catch(() => !ignore && setModels([]));
    return () => {
      ignore = true;
    };
  }, [fMake]);

  const previews = useMemo(() => files.map(f => ({ file: f, url: URL.createObjectURL(f) })), [files]);

  const changeTopCat = (v: string) => {
    setTopCat(v);
    setSubCat(undefined);
    setSubCats([]);
  };
  const changeFMake = (v: string) => {
    setFMake(v);
    setFModel(undefined);
    setModels([]);
  };

  const addPhotos = (list: FileList | null) => {
    if (!list) return;
    setFiles(prev => [...prev, ...Array.from(list)].slice(0, MAX_PHOTOS));
  };
  const removePhoto = (i: number) => setFiles(prev => prev.filter((_, idx) => idx !== i));

  const toggleDelivery = (opt: string) =>
    setDelivery(prev => (prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]));

  const addFitment = () => {
    if (!fModel) return;
    const label = `${makes.find(m => m.id === fMake)?.name ?? ""} ${models.find(m => m.id === fModel)?.name ?? ""}`.trim();
    setFitments(prev => [
      ...prev,
      { modelId: fModel, yearFrom: fFrom ? Number(fFrom) : undefined, yearTo: fTo ? Number(fTo) : undefined, label },
    ]);
    setFModel(undefined);
    setFFrom(undefined);
    setFTo(undefined);
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (files.length === 0) e.photos = "Add at least one photo";
    if (!title.trim()) e.title = "Give your part a title";
    if (!price || Number(price) <= 0) e.price = "Enter a price";
    if (!condition) e.condition = "Pick a condition";
    if (!subCat && !topCat) e.category = "Pick a category";
    if (!city) e.city = "Pick your city";
    if (!weightTier) e.weightTier = "Pick a weight band";
    if (delivery.length === 0) e.delivery = "Pick at least one delivery option";
    if (!universalFit && fitments.length === 0) e.fitment = "Add the vehicles this fits, or mark it universal";
    if (!legal) e.legal = "You must confirm the part was legally sourced";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const imageUrls: string[] = [];
      for (const file of files) {
        const sig = await market.uploadSignature();
        imageUrls.push(await uploadListingImage(sig, file));
      }
      const { id } = await market.create({
        title: title.trim(),
        description: description.trim() || undefined,
        price: Number(price),
        condition: condition!,
        city: city!,
        categoryId: subCat ?? topCat!,
        imageUrls,
        deliveryOptions: delivery,
        weightTier: weightTier!,
        universalFit,
        fitments: universalFit ? [] : fitments.map(({ modelId, yearFrom, yearTo }) => ({ modelId, yearFrom, yearTo })),
        legalSourcingDeclared: true,
      });
      router.push(`/market/listings/${id}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Could not upload the photos or create the listing.");
      setSubmitting(false);
    }
  };

  if (!authLoading && !signedIn) {
    return (
      <div className="mx-auto max-w-[560px] px-4 py-16 text-center sm:px-6">
        <h1 className="text-xl font-bold text-text">Sign in to sell a part</h1>
        <p className="mt-2 text-sm text-muted">List your car parts and engines with escrow-protected checkout.</p>
        <Link href="/login?next=/market/sell" className="mt-5 inline-block">
          <Button size="md">Sign in</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px] px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-text">Sell a part</h1>
      <p className="mt-1 text-sm text-muted">List a car part or engine. Buyers pay by escrow — funds release when they confirm it arrived.</p>

      <div className="mt-6 flex flex-col gap-6">
        {/* Photos */}
        <section className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text">Photos ({files.length}/{MAX_PHOTOS})</span>
          <div className="flex flex-wrap gap-2.5">
            {previews.map((p, i) => (
              <div key={p.url} className="relative h-24 w-24 overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                <img src={p.url} alt="" className="h-full w-full object-cover" />
                <button
                  onClick={() => removePhoto(i)}
                  aria-label="Remove photo"
                  className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-dark/70 text-xs text-white"
                >
                  ×
                </button>
              </div>
            ))}
            {files.length < MAX_PHOTOS && (
              <label className="grid h-24 w-24 cursor-pointer place-items-center rounded-lg border border-dashed border-border text-2xl text-muted hover:border-primary hover:text-primary">
                +
                <input type="file" accept="image/*" multiple className="hidden" onChange={e => addPhotos(e.target.files)} />
              </label>
            )}
          </div>
          {errors.photos && <span className="text-xs text-red">{errors.photos}</span>}
        </section>

        <Field label="Title" error={errors.title}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Toyota 2NZ 1.3L Complete Engine — ex-Japan"
            className="h-11 rounded-md border border-border bg-white px-3.5 text-[15px] text-text outline-none focus:border-primary"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            placeholder="Condition, mileage, what it fits, guarantee…"
            className="rounded-md border border-border bg-white px-3.5 py-2.5 text-[15px] text-text outline-none focus:border-primary"
          />
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Price (USD)" error={errors.price}>
            <input
              value={price}
              onChange={e => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="650"
              className="h-11 rounded-md border border-border bg-white px-3.5 text-[15px] text-text outline-none focus:border-primary"
            />
          </Field>
          <Field label="Condition" error={errors.condition}>
            <Select value={condition} onValueChange={setCondition} placeholder="Select condition" options={CONDITIONS} />
          </Field>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Category" error={errors.category}>
            <Select value={topCat} onValueChange={changeTopCat} placeholder="Category" options={topCats.map(c => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="Sub-category">
            <Select value={subCat} onValueChange={setSubCat} placeholder="Sub-category" options={subCats.map(c => ({ value: c.id, label: c.name }))} disabled={!topCat || subCats.length === 0} />
          </Field>
        </div>

        {/* Fitment */}
        <section className="rounded-lg border border-border bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-text">What does it fit?</span>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={universalFit} onChange={e => setUniversalFit(e.target.checked)} className="h-4 w-4 accent-primary" />
              Fits all vehicles (universal)
            </label>
          </div>

          {!universalFit && (
            <>
              {fitments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {fitments.map((f, i) => (
                    <span key={i} className="flex items-center gap-1.5 rounded-full border border-green bg-white px-2.5 py-1 text-xs font-medium text-green">
                      {f.label}
                      {(f.yearFrom || f.yearTo) && ` ${f.yearFrom ?? ""}–${f.yearTo ?? ""}`}
                      <button onClick={() => setFitments(prev => prev.filter((_, idx) => idx !== i))} aria-label="Remove" className="text-muted hover:text-red">
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
                <Select value={fMake} onValueChange={changeFMake} placeholder="Make" options={makes.map(m => ({ value: m.id, label: m.name }))} />
                <Select value={fModel} onValueChange={setFModel} placeholder="Model" options={models.map(m => ({ value: m.id, label: m.name }))} disabled={!fMake} />
                <div className="w-24"><Select value={fFrom} onValueChange={setFFrom} placeholder="From" options={YEARS.map(y => ({ value: y, label: y }))} /></div>
                <div className="w-24"><Select value={fTo} onValueChange={setFTo} placeholder="To" options={YEARS.map(y => ({ value: y, label: y }))} /></div>
                <button onClick={addFitment} disabled={!fModel} className="h-11 rounded-md border border-primary px-3 text-sm font-semibold text-primary hover:bg-primary-light disabled:opacity-40">
                  Add
                </button>
              </div>
              {errors.fitment && <span className="mt-2 block text-xs text-red">{errors.fitment}</span>}
            </>
          )}
        </section>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Your city" error={errors.city}>
            <Select value={city} onValueChange={setCity} placeholder="City" options={CITIES.map(c => ({ value: c, label: c }))} />
          </Field>
          <Field label="Weight band" error={errors.weightTier}>
            <Select value={weightTier} onValueChange={setWeightTier} placeholder="Weight" options={WEIGHT_TIERS} />
          </Field>
        </div>

        <div>
          <span className="text-sm font-medium text-text">Delivery options</span>
          <div className="mt-2 flex flex-wrap gap-4">
            {DELIVERY_OPTIONS.map(opt => (
              <label key={opt} className="flex cursor-pointer items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={delivery.includes(opt)} onChange={() => toggleDelivery(opt)} className="h-4 w-4 accent-primary" />
                {opt}
              </label>
            ))}
          </div>
          {errors.delivery && <span className="mt-1 block text-xs text-red">{errors.delivery}</span>}
        </div>

        <label className="flex items-start gap-2.5 rounded-lg border border-border bg-white p-3.5">
          <input type="checkbox" checked={legal} onChange={e => setLegal(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
          <span className="text-sm text-muted">{DECLARATION}</span>
        </label>
        {errors.legal && <span className="-mt-4 text-xs text-red">{errors.legal}</span>}

        {submitError && <Alert tone="error">{submitError}</Alert>}

        <Button size="lg" onClick={submit} loading={submitting} disabled={submitting}>
          {submitting ? "Publishing…" : "Publish listing"}
        </Button>
      </div>
    </div>
  );
}
