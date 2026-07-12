"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { collectUkBookings, CollectUkBookingTrackingInfo, FulfilmentApiError } from "@/lib/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function CollectUkTrackingPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<CollectUkBookingTrackingInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await collectUkBookings.track(token);
        if (!cancelled) setInfo(result);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof FulfilmentApiError && err.status === 429
            ? "Too many requests. Please wait a while and try again."
            : "This tracking link is invalid or has expired.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto max-w-2xl px-6 py-3">
          <span className="text-lg font-semibold text-primary">Faira Collect</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="text-xl font-semibold text-text">Track your collection</h1>

        {loading && (
          <Card className="mt-6 flex flex-col gap-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
          </Card>
        )}

        {!loading && error && (
          <div className="mt-6">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        {!loading && info && (
          <Card className="mt-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-muted">{info.reference}</span>
              <StatusBadge label={info.status} tone={info.status === "Collected" ? "success" : "info"} />
            </div>

            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Shipping company</dt>
                <dd className="text-right text-text">{info.companyName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Destination</dt>
                <dd className="text-right text-text">{info.destinationCountry}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Collection address</dt>
                <dd className="text-right text-text">
                  {info.collectionAddress}, {info.collectionPostcode}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Preferred date</dt>
                <dd className="text-right text-text">{formatDate(info.preferredDate)}</dd>
              </div>
            </dl>
          </Card>
        )}
      </main>
    </div>
  );
}
