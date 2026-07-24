"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { ShipmentStatusBadge } from "@/components/collect-uk/ShipmentStatusBadge";
import { useCompanyPortal } from "@/lib/companyContext";
import { collectUkShipments, CollectUkShipmentSummary, CollectUkShipmentAnalytics, FulfilmentApiError } from "@/lib/api";

const money = (pence: number) => `£${(pence / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CompanyShipmentsPage() {
  const { company } = useCompanyPortal();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shipments, setShipments] = useState<CollectUkShipmentSummary[]>([]);
  const [analytics, setAnalytics] = useState<CollectUkShipmentAnalytics | null>(null);
  const [reference, setReference] = useState("");
  const [destination, setDestination] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [list, an] = await Promise.all([
          collectUkShipments.list(company.id),
          collectUkShipments.analytics(company.id).catch(() => null),
        ]);
        setShipments(list);
        setAnalytics(an);
      } catch (err) {
        setError(err instanceof FulfilmentApiError ? err.message : "Could not load shipments right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, [company.id]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!reference.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await collectUkShipments.create(company.id, {
        reference: reference.trim(),
        destinationCountry: destination,
      });
      // Straight into the shipment so they can add recipients and post the
      // first update -- that's the whole point of creating one.
      router.push(`/collect-uk/companies/${company.id}/shipments/${created.id}`);
    } catch (err) {
      setCreateError(err instanceof FulfilmentApiError ? err.message : "Could not create this shipment.");
      setCreating(false);
    }
  };

  const base = `/collect-uk/companies/${company.id}/shipments`;

  return (
    <div className="flex flex-col gap-4">
      {analytics && analytics.totals.shipments > 0 && (
        <Card>
          <h2 className="text-base font-semibold text-text">Overview</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Shipments", value: String(analytics.totals.shipments) },
              { label: "Parcels", value: String(analytics.totals.parcels) },
              { label: "Weight", value: `${analytics.totals.totalWeightKg} kg` },
              { label: "Declared value", value: money(analytics.totals.totalDeclaredValuePence) },
            ].map(stat => (
              <div key={stat.label} className="rounded-md border border-border p-3">
                <div className="text-lg font-semibold text-text">{stat.value}</div>
                <div className="text-xs text-muted">{stat.label}</div>
              </div>
            ))}
          </div>
          {analytics.byDestination.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">By destination</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {analytics.byDestination.map(d => (
                  <li key={d.destination} className="flex flex-wrap items-center justify-between gap-x-3 text-sm">
                    <span className="font-medium text-text">{d.destination}</span>
                    <span className="text-muted">
                      {d.shipments} shipment{d.shipments === 1 ? "" : "s"} · {d.parcels} parcel{d.parcels === 1 ? "" : "s"} ·{" "}
                      {d.totalWeightKg} kg · {money(d.totalDeclaredValuePence)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <Card>
        <h2 className="text-base font-semibold text-text">New shipment</h2>
        <p className="mt-1 text-sm text-muted">
          Group the goods leaving on one journey (e.g. a container), then post transit updates once and every
          customer on it is texted automatically.
        </p>
        <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-4">
          <Field label="Shipment name" hint="How you'll recognise it, e.g. “Container to Harare — July”" required>
            {p => <Input {...p} value={reference} onChange={e => setReference(e.target.value)} placeholder="Container to Harare — July" />}
          </Field>
          {company.countriesServed.length > 0 && (
            <Field label="Destination" hint="Optional">
              {p => (
                <Select
                  {...p}
                  value={destination}
                  onValueChange={setDestination}
                  placeholder="Not set"
                  options={company.countriesServed.map(c => ({ value: c, label: c }))}
                />
              )}
            </Field>
          )}
          {createError && <Alert tone="error">{createError}</Alert>}
          <Button type="submit" size="md" loading={creating} disabled={!reference.trim()}>
            Create shipment
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-text">Shipments</h2>
        {loading && (
          <div className="mt-3 flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}
        {!loading && error && <Alert tone="error">{error}</Alert>}
        {!loading && !error && shipments.length === 0 && (
          <p className="mt-3 text-sm text-muted">No shipments yet — create one above to start posting transit updates.</p>
        )}
        {!loading && shipments.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {shipments.map(s => (
              <li key={s.id}>
                <Link
                  href={`${base}/${s.id}`}
                  className="flex items-center justify-between rounded-md border border-border p-3 transition-colors hover:border-primary"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text">{s.reference}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      {s.recipientCount} recipient{s.recipientCount === 1 ? "" : "s"}
                      {s.latestStage ? ` · ${s.latestStage}` : " · no updates yet"}
                    </div>
                  </div>
                  <ShipmentStatusBadge status={s.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
