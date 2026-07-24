"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useDispatchAuth } from "@/lib/dispatchContext";
import { collectUkDispatch, CollectUkAdminCompany, FulfilmentApiError } from "@/lib/api";

export default function DispatchCompaniesPage() {
  const { token, authFailure } = useDispatchAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<CollectUkAdminCompany[]>([]);
  const [rateCompanyId, setRateCompanyId] = useState<string | undefined>(undefined);
  const [rateBase, setRateBase] = useState("");
  const [rateSmall, setRateSmall] = useState("");
  const [rateMedium, setRateMedium] = useState("");
  const [rateLarge, setRateLarge] = useState("");
  const [rateXl, setRateXl] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setCompanies(await collectUkDispatch.listCompanies(token));
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.status === 401) return authFailure();
      setLoadError(err instanceof FulfilmentApiError ? err.message : "Could not load companies right now.");
    } finally {
      setLoading(false);
    }
  }, [token, authFailure]);

  useEffect(() => {
    void load();
  }, [load]);

  const poundsToPence = (v: string) => Math.round(Number.parseFloat(v) * 100);
  const rateInputsValid = [rateBase, rateSmall, rateMedium, rateLarge, rateXl].every(
    v => v.trim() !== "" && Number.isFinite(Number.parseFloat(v)) && Number.parseFloat(v) >= 0,
  );

  const handleSaveRate = async (e: FormEvent) => {
    e.preventDefault();
    if (!rateCompanyId || !rateInputsValid) return;
    setSavingRate(true);
    try {
      await collectUkDispatch.setCompanyRate(token, rateCompanyId, {
        basePerStopPence: poundsToPence(rateBase),
        tierSmallPence: poundsToPence(rateSmall),
        tierMediumPence: poundsToPence(rateMedium),
        tierLargePence: poundsToPence(rateLarge),
        tierXlPence: poundsToPence(rateXl),
      });
      toast({ title: "Rate saved", tone: "success" });
      await load();
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.status === 401) return authFailure();
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not save the rate", tone: "error" });
    } finally {
      setSavingRate(false);
    }
  };

  if (loading) {
    return (
      <Card className="flex flex-col gap-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-full" />
      </Card>
    );
  }
  if (loadError) return <Alert tone="error">{loadError}</Alert>;

  return (
    <>
      <h1 className="text-xl font-semibold text-text">Companies</h1>
      <p className="mt-1 text-sm text-muted">
        Every company on the platform with the rate Vamba Collect charges them. Click a company for its full
        booking history.
      </p>

      <Card className="mt-4">
        {companies.length === 0 && <p className="text-sm text-muted">No companies registered yet.</p>}
        {companies.length > 0 && (
          <ul className="flex flex-col gap-2">
            {companies.map(c => (
              <li key={c.id}>
                <Link
                  href={`/collect-uk/dispatch/companies/${c.id}`}
                  className="flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm transition-colors duration-200 hover:border-primary"
                >
                  <span className="font-medium text-text">{c.name}</span>
                  <span className="text-muted">
                    {c.rate
                      ? `£${(c.rate.basePerStopPence / 100).toFixed(2)}/stop + £${(c.rate.tierSmallPence / 100).toFixed(2)}–£${(c.rate.tierXlPence / 100).toFixed(2)}/parcel`
                      : "no rate set"}{" "}
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="text-base font-semibold text-text">Set a company&rsquo;s rate (£)</h2>
        <p className="mt-1 text-sm text-muted">
          Base per stop + per parcel by size. Charges snapshot when the company confirms a handover.
        </p>
        <form onSubmit={handleSaveRate} className="mt-3 flex flex-col gap-4">
          <Field label="Company" required>
            {p => (
              <Select
                {...p}
                value={rateCompanyId}
                onValueChange={setRateCompanyId}
                options={companies.map(c => ({ value: c.id, label: c.name }))}
                placeholder="Choose a company"
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Field label="Per stop" required>
              {p => <Input {...p} type="number" min={0} step="0.01" value={rateBase} onChange={e => setRateBase(e.target.value)} />}
            </Field>
            <Field label="Small" required>
              {p => <Input {...p} type="number" min={0} step="0.01" value={rateSmall} onChange={e => setRateSmall(e.target.value)} />}
            </Field>
            <Field label="Medium" required>
              {p => <Input {...p} type="number" min={0} step="0.01" value={rateMedium} onChange={e => setRateMedium(e.target.value)} />}
            </Field>
            <Field label="Large" required>
              {p => <Input {...p} type="number" min={0} step="0.01" value={rateLarge} onChange={e => setRateLarge(e.target.value)} />}
            </Field>
            <Field label="XL" required>
              {p => <Input {...p} type="number" min={0} step="0.01" value={rateXl} onChange={e => setRateXl(e.target.value)} />}
            </Field>
          </div>
          <Button type="submit" size="md" loading={savingRate} disabled={!rateCompanyId || !rateInputsValid}>
            Save rate
          </Button>
        </form>
      </Card>
    </>
  );
}
