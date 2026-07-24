"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { describeItems } from "@/lib/collectUkItemLabels";
import { useDispatchAuth } from "@/lib/dispatchContext";
import { collectUkDispatch, CollectUkAdminCompanyBookings, FulfilmentApiError } from "@/lib/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatPounds(pence: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "error" | "warning"> = {
  REQUESTED: "info",
  SCHEDULED: "info",
  DRIVER_ASSIGNED: "warning",
  EN_ROUTE: "warning",
  COLLECTED: "success",
  AT_WAREHOUSE: "success",
  HANDED_OVER: "success",
  UNABLE_TO_COLLECT: "error",
  CANCELLED: "neutral",
  CLOSED: "neutral",
};

export default function DispatchCompanyBookingsPage() {
  const { id } = useParams<{ id: string }>();
  const { token, authFailure } = useDispatchAuth();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CollectUkAdminCompanyBookings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await collectUkDispatch.getCompanyBookings(token, id));
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.status === 401) return authFailure();
      setError(err instanceof FulfilmentApiError ? err.message : "Could not load this company right now.");
    } finally {
      setLoading(false);
    }
  }, [token, id, authFailure]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Card className="flex flex-col gap-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-full" />
      </Card>
    );
  }
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return null;

  const totalCharged = data.bookings.reduce((sum, b) => sum + (b.chargePence ?? 0), 0);
  const active = data.bookings.filter(b => !["HANDED_OVER", "CANCELLED", "CLOSED"].includes(b.status)).length;

  return (
    <>
      <Link
        href="/collect-uk/dispatch/companies"
        className="cursor-pointer text-sm font-medium text-muted transition-colors duration-200 hover:text-primary"
      >
        ← All companies
      </Link>

      <h1 className="mt-2 text-xl font-semibold text-text">{data.company.name}</h1>
      <p className="mt-1 text-sm text-muted">
        Full booking history — every status, Vamba Collect&rsquo;s view. Booking link slug:{" "}
        <span className="font-mono">{data.company.slug}</span>
      </p>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-md border border-border bg-white p-3">
          <p className="text-2xl font-bold text-text">{data.bookings.length}</p>
          <p className="text-xs text-muted">bookings all-time</p>
        </div>
        <div className="rounded-md border border-border bg-white p-3">
          <p className="text-2xl font-bold text-primary">{active}</p>
          <p className="text-xs text-muted">in progress now</p>
        </div>
        <div className="rounded-md border border-border bg-white p-3">
          <p className="text-2xl font-bold text-text">{formatPounds(totalCharged)}</p>
          <p className="text-xs text-muted">charged to date</p>
        </div>
      </div>

      <Card className="mt-4">
        {data.bookings.length === 0 && <p className="text-sm text-muted">No bookings yet for this company.</p>}
        {data.bookings.length > 0 && (
          <ul className="flex flex-col gap-3">
            {data.bookings.map(b => (
              <li key={b.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-text">{b.reference}</span>
                  <span className="flex items-center gap-2">
                    {b.chargePence != null && (
                      <span className="font-semibold text-text">{formatPounds(b.chargePence)}</span>
                    )}
                    <StatusBadge label={b.status.replaceAll("_", " ")} tone={STATUS_TONE[b.status] ?? "neutral"} />
                  </span>
                </div>
                <p className="mt-1 text-text">
                  {b.customerName} · {b.customerContact}
                </p>
                <p className="text-muted">
                  {b.collectionAddress}, {b.collectionPostcode}
                </p>
                <p className="text-muted">
                  {b.numberOfParcels} parcel{b.numberOfParcels === 1 ? "" : "s"}
                  {b.itemTypes.length > 0 && <> · {describeItems(b.itemTypes, b.itemTypeOther, b.vehicleType)}</>}
                  {" · "}
                  {b.collectionWindow
                    ? `week ${formatDate(b.collectionWindow.startDate)} – ${formatDate(b.collectionWindow.endDate)}`
                    : "no collection week"}
                  {" · booked "}
                  {formatDate(b.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
