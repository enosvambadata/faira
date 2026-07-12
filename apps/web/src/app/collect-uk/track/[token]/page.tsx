"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { Package, Check } from "@/components/ui/icons";
import { collectUkBookings, CollectUkBookingTrackingInfo, FulfilmentApiError } from "@/lib/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// The API deliberately exposes only the customer-facing wording (see
// collectUkBuyerStatus on the API side), so the timeline maps those exact
// labels to a journey step. Unknown/terminal labels (unable to collect,
// cancelled) simply render without a highlighted timeline.
const JOURNEY_STEPS = ["Booking received", "Driver assigned", "Collected", "At the warehouse", "Handed over"];

const LABEL_TO_STEP: Record<string, number> = {
  "Booking received -- awaiting scheduling": 1,
  "Collection scheduled": 2,
  "A driver has been assigned": 2,
  "Driver is on the way": 2,
  Collected: 3,
  "Arrived at the warehouse": 4,
  "Handed over to your shipping company": 5,
  Completed: 5,
};

function statusTone(status: string): "success" | "error" | "info" {
  if (status === "Handed over to your shipping company" || status === "Completed" || status === "Collected")
    return "success";
  if (status.startsWith("We were unable to collect") || status === "Cancelled") return "error";
  return "info";
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

  const currentStep = info ? (LABEL_TO_STEP[info.status] ?? 0) : 0;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5 px-6 py-3.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-dark text-white">
            <Package size={17} />
          </span>
          <span className="text-lg font-semibold text-text">Faira Collect</span>
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
          <>
            <Card className="mt-6 flex flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-sm text-muted">{info.reference}</span>
                <StatusBadge label={info.status} tone={statusTone(info.status)} />
              </div>

              {currentStep > 0 && (
                <ol aria-label="Collection progress" className="flex flex-col gap-0">
                  {JOURNEY_STEPS.map((step, i) => {
                    const stepNo = i + 1;
                    const done = stepNo < currentStep;
                    const current = stepNo === currentStep;
                    return (
                      <li key={step} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-200 ${
                              done
                                ? "bg-green text-white"
                                : current
                                  ? "bg-primary text-white ring-4 ring-primary-light"
                                  : "border border-border bg-white text-muted"
                            }`}
                          >
                            {done ? <Check size={14} /> : stepNo}
                          </span>
                          {stepNo < JOURNEY_STEPS.length && (
                            <span className={`w-0.5 flex-1 ${done ? "bg-green" : "bg-border"}`} aria-hidden="true" />
                          )}
                        </div>
                        <div className={`pb-5 ${stepNo === JOURNEY_STEPS.length ? "pb-0" : ""}`}>
                          <p
                            className={`pt-1 text-sm font-medium ${
                              current ? "text-primary" : done ? "text-text" : "text-muted"
                            }`}
                          >
                            {step}
                          </p>
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
          </>
        )}
      </main>
    </div>
  );
}
