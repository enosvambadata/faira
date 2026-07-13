"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCompanyPortal } from "@/lib/companyContext";
import { collectUkCompanies, CollectUkBillingStatement, FulfilmentApiError } from "@/lib/api";

function formatPounds(pence: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function CompanyBillingPage() {
  const { company } = useCompanyPortal();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billing, setBilling] = useState<CollectUkBillingStatement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setBilling(await collectUkCompanies.getBilling(company.id));
      } catch (err) {
        setError(err instanceof FulfilmentApiError ? err.message : "Could not load billing right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, [company.id]);

  if (loading) {
    return (
      <Card className="flex flex-col gap-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-full" />
      </Card>
    );
  }
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!billing) return null;

  return (
    <Card>
      <h2 className="text-base font-semibold text-text">Billing</h2>
      <p className="mt-1 text-sm text-muted">
        What Faira charges you for completed collections — a charge is added each time you confirm a
        handover.
      </p>

      {billing.rate ? (
        <p className="mt-3 text-sm text-muted">
          Your rate: {formatPounds(billing.rate.basePerStopPence)} per collection stop +{" "}
          {formatPounds(billing.rate.tierSmallPence)}/{formatPounds(billing.rate.tierMediumPence)}/
          {formatPounds(billing.rate.tierLargePence)}/{formatPounds(billing.rate.tierXlPence)} per parcel
          (small/medium/large/XL). Vehicles quoted separately.
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">
          No rate agreed with Faira yet — completed collections are recorded but not charged.
        </p>
      )}

      {billing.groups.length > 0 && (
        <>
          <div className="mt-4 rounded-md border border-border bg-bg p-4 text-center">
            <p className="text-2xl font-bold text-dark">{formatPounds(billing.grandTotalPence)}</p>
            <p className="text-xs text-muted">total for all completed collections</p>
          </div>
          <div className="mt-4 flex flex-col gap-4">
            {billing.groups.map((group, i) => (
              <div key={i} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-text">
                    {group.window
                      ? `Week ${formatDate(group.window.startDate)} – ${formatDate(group.window.endDate)}`
                      : "No collection week"}
                  </span>
                  <span className="font-semibold text-text">{formatPounds(group.totalPence)}</span>
                </div>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-muted">
                  {group.lines.map(line => (
                    <li key={line.id} className="flex justify-between gap-4">
                      <span>
                        <span className="font-mono">{line.reference}</span> — {line.customerName} (
                        {line.numberOfParcels} × {line.parcelSizeTier.replaceAll("_", " ").toLowerCase()})
                      </span>
                      <span>
                        {line.isVehicle
                          ? "vehicle — quoted separately"
                          : line.chargePence != null
                            ? formatPounds(line.chargePence)
                            : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
      {billing.groups.length === 0 && <p className="mt-3 text-sm text-muted">No completed collections yet.</p>}
    </Card>
  );
}
