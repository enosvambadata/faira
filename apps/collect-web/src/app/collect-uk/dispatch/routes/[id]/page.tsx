"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useDispatchAuth } from "@/lib/dispatchContext";
import { collectUkDispatch, CollectUkAdminRouteDetail, FulfilmentApiError } from "@/lib/api";

const STOP_TONE = { PENDING: "info", COLLECTED: "success", UNABLE_TO_COLLECT: "error" } as const;

export default function DispatchRouteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, authFailure } = useDispatchAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<CollectUkAdminRouteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startPostcode, setStartPostcode] = useState("");
  const [optimising, setOptimising] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRoute(await collectUkDispatch.getRoute(token, id));
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.status === 401) return authFailure();
      setError(err instanceof FulfilmentApiError ? err.message : "Could not load this route right now.");
    } finally {
      setLoading(false);
    }
  }, [token, id, authFailure]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOptimise = async (e: FormEvent) => {
    e.preventDefault();
    setOptimising(true);
    try {
      await collectUkDispatch.optimiseRoute(token, id, startPostcode.trim() || undefined);
      toast({ title: "Route optimised", tone: "success" });
      await load();
    } catch (err) {
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not optimise this route", tone: "error" });
    } finally {
      setOptimising(false);
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
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!route) return null;

  return (
    <>
      <Link
        href="/collect-uk/dispatch/routes"
        className="cursor-pointer text-sm font-medium text-muted transition-colors duration-200 hover:text-primary"
      >
        ← All routes
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-text">
          Route — {new Date(route.routeDate).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </h1>
        <StatusBadge label={route.status.replaceAll("_", " ")} tone={route.status === "COMPLETED" ? "success" : "info"} />
      </div>
      <p className="mt-1 text-sm text-muted">
        {route.stops.length} stop{route.stops.length === 1 ? "" : "s"}
        {route.totalDistanceMiles != null && (
          <>
            {" "}
            — est. <span className="font-semibold text-text">{route.totalDistanceMiles} miles</span> total
          </>
        )}
      </p>

      {route.status === "PLANNED" && route.stops.length > 0 && (
        <Card className="mt-4">
          <h2 className="text-base font-semibold text-text">Optimise stop order</h2>
          <p className="mt-1 text-sm text-muted">
            Orders stops by driving proximity and calculates mileage. Give the driver&rsquo;s starting
            postcode for an accurate first leg.
          </p>
          <form onSubmit={handleOptimise} className="mt-3 flex flex-wrap items-end gap-3">
            <div className="w-48">
              <Field label="Start postcode" hint="Optional">
                {p => <Input {...p} value={startPostcode} onChange={e => setStartPostcode(e.target.value)} placeholder="WV1 1AA" />}
              </Field>
            </div>
            <Button type="submit" size="md" loading={optimising}>
              Optimise route
            </Button>
          </form>
        </Card>
      )}

      <Card className="mt-4">
        <h2 className="text-base font-semibold text-text">Stops</h2>
        {route.stops.length === 0 && (
          <p className="mt-3 text-sm text-muted">No stops yet — assign bookings from the Queue tab.</p>
        )}
        {route.stops.length > 0 && (
          <ol className="mt-3 flex flex-col gap-3">
            {route.stops.map((s, i) => (
              <li key={s.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-text">
                    {i + 1}. {s.customerName} <span className="font-normal text-muted">({s.companyName})</span>
                  </span>
                  <StatusBadge label={s.status.replaceAll("_", " ")} tone={STOP_TONE[s.status]} />
                </div>
                <p className="mt-1 text-muted">
                  {s.collectionAddress}, {s.collectionPostcode}
                  {s.distanceFromPreviousMiles != null && <> · ~{s.distanceFromPreviousMiles} mi from previous</>}
                </p>
                <p className="font-mono text-xs text-muted">{s.bookingReference}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
