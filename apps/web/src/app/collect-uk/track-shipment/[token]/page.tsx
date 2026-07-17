"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { Package, Check } from "@/components/ui/icons";
import { ShipmentStatusBadge } from "@/components/collect-uk/ShipmentStatusBadge";
import { collectUkShipmentTracking, CollectUkShipmentTrackingInfo, FulfilmentApiError } from "@/lib/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function CollectUkShipmentTrackingPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<CollectUkShipmentTrackingInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await collectUkShipmentTracking.track(token);
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

  // Newest first: the top of the timeline is where the goods are now.
  const timeline = info ? [...info.milestones].reverse() : [];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5 px-6 py-3.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-dark text-white">
            <Package size={17} />
          </span>
          <span className="text-lg font-semibold text-text">Vamba Collect</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="text-xl font-semibold text-text">Track your shipment</h1>

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
          <>
            <Card className="mt-6 flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-muted">{info.reference}</span>
                <ShipmentStatusBadge status={info.status} />
              </div>
              <p className="text-sm text-text">
                Hi {info.customerName}, here&apos;s the latest on your goods
                {info.destinationCountry ? ` to ${info.destinationCountry}` : ""}.
              </p>

              {timeline.length === 0 ? (
                <p className="text-sm text-muted">No updates yet — we&apos;ll text you as your shipment moves.</p>
              ) : (
                <ol aria-label="Shipment progress" className="flex flex-col gap-0">
                  {timeline.map((m, i) => {
                    const isLatest = i === 0;
                    return (
                      <li key={m.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                              isLatest ? "bg-primary text-white ring-4 ring-primary-light" : "bg-green text-white"
                            }`}
                          >
                            {isLatest ? "" : <Check size={14} />}
                          </span>
                          {i < timeline.length - 1 && <span className="w-0.5 flex-1 bg-green" aria-hidden="true" />}
                        </div>
                        <div className={`pb-5 ${i === timeline.length - 1 ? "pb-0" : ""}`}>
                          <p className={`pt-1 text-sm font-medium ${isLatest ? "text-primary" : "text-text"}`}>
                            {m.stage}
                            {m.location ? <span className="font-normal text-muted"> · {m.location}</span> : null}
                          </p>
                          {m.note && <p className="mt-0.5 text-sm text-muted">{m.note}</p>}
                          {m.pickupAddress && (
                            <p className="mt-1 text-sm text-text">
                              📍 Ready for collection at {m.pickupAddress}
                              {m.pickupFrom && m.pickupTo ? ` between ${formatDate(m.pickupFrom)} and ${formatDate(m.pickupTo)}` : ""}
                            </p>
                          )}
                          <p className="mt-0.5 text-xs text-muted">{formatDateTime(m.createdAt)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>

            <Card className="mt-4">
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Shipping company</dt>
                  <dd className="text-right text-text">{info.companyName}</dd>
                </div>
                {info.destinationCountry && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Destination</dt>
                    <dd className="text-right text-text">{info.destinationCountry}</dd>
                  </div>
                )}
              </dl>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
