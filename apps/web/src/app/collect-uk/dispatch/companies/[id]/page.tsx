"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { CollectBrand } from "@/components/collect-uk/CollectBrand";
import { describeItems } from "@/lib/collectUkItemLabels";
import { getDispatchToken, clearDispatchToken } from "@/lib/dispatchToken";
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

  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CollectUkAdminCompanyBookings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(getDispatchToken());
    setReady(true);
  }, []);

  const load = useCallback(
    async (activeToken: string) => {
      setLoading(true);
      setError(null);
      try {
        setData(await collectUkDispatch.getCompanyBookings(activeToken, id));
      } catch (err) {
        if (err instanceof FulfilmentApiError && err.status === 401) {
          clearDispatchToken();
          setToken(null);
          return;
        }
        setError(err instanceof FulfilmentApiError ? err.message : "Could not load this company right now.");
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    if (token) void load(token);
    else if (ready) setLoading(false);
  }, [token, ready, load]);

  const totalCharged = data ? data.bookings.reduce((sum, b) => sum + (b.chargePence ?? 0), 0) : 0;
  const active = data
    ? data.bookings.filter(b => !["HANDED_OVER", "CANCELLED", "CLOSED"].includes(b.status)).length
    : 0;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <CollectBrand suffix="Dispatch" />
          <Link
            href="/collect-uk/dispatch"
            className="cursor-pointer text-sm font-medium text-muted transition-colors duration-200 hover:text-primary"
          >
            Dispatch board
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        {ready && !token && (
          <Alert tone="error">
            Dispatch is locked — go back to the{" "}
            <Link href="/collect-uk/dispatch" className="cursor-pointer font-medium underline">
              dispatch board
            </Link>{" "}
            and enter the admin token.
          </Alert>
        )}

        {token && loading && (
          <Card className="flex flex-col gap-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
          </Card>
        )}

        {token && !loading && error && <Alert tone="error">{error}</Alert>}

        {token && !loading && data && (
          <>
            <h1 className="text-xl font-semibold text-text">{data.company.name}</h1>
            <p className="mt-1 text-sm text-muted">
              Full booking history — every status, Faira&rsquo;s view. Booking link slug:{" "}
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
        )}
      </main>
    </div>
  );
}
