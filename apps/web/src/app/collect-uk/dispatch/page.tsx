"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { describeItems } from "@/lib/collectUkItemLabels";
import { useDispatchAuth } from "@/lib/dispatchContext";
import {
  collectUkDispatch,
  CollectUkUnscheduledBooking,
  CollectUkFailedBooking,
  CollectUkAdminRouteSummary,
  FulfilmentApiError,
} from "@/lib/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// The dispatcher's daily work: what needs scheduling, and what failed.
export default function DispatchQueuePage() {
  const { token, authFailure } = useDispatchAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queue, setQueue] = useState<CollectUkUnscheduledBooking[]>([]);
  const [failed, setFailed] = useState<CollectUkFailedBooking[]>([]);
  const [routes, setRoutes] = useState<CollectUkAdminRouteSummary[]>([]);
  const [assignRouteByBooking, setAssignRouteByBooking] = useState<Record<string, string>>({});
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [requeueingId, setRequeueingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [q, f, r] = await Promise.all([
        collectUkDispatch.listUnscheduled(token),
        collectUkDispatch.listFailed(token),
        collectUkDispatch.listRoutes(token),
      ]);
      setQueue(q);
      setFailed(f);
      setRoutes(r);
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.status === 401) return authFailure();
      setLoadError(err instanceof FulfilmentApiError ? err.message : "Could not load the queue right now.");
    } finally {
      setLoading(false);
    }
  }, [token, authFailure]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAssign = async (bookingId: string) => {
    const routeId = assignRouteByBooking[bookingId];
    if (!routeId) return;
    setAssigningId(bookingId);
    try {
      await collectUkDispatch.assignStop(token, routeId, bookingId);
      toast({ title: "Booking assigned to route", tone: "success" });
      await load();
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.status === 401) return authFailure();
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not assign this booking", tone: "error" });
    } finally {
      setAssigningId(null);
    }
  };

  const handleRequeue = async (bookingId: string) => {
    setRequeueingId(bookingId);
    try {
      await collectUkDispatch.requeueBooking(token, bookingId);
      toast({ title: "Booking returned to the queue", tone: "success" });
      await load();
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.status === 401) return authFailure();
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not requeue this booking", tone: "error" });
    } finally {
      setRequeueingId(null);
    }
  };

  const plannedRoutes = routes.filter(r => r.status === "PLANNED");

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
      <h1 className="text-xl font-semibold text-text">Queue</h1>

      <Card className="mt-4">
        <h2 className="text-base font-semibold text-text">
          Unscheduled bookings <span className="font-normal text-muted">({queue.length})</span>
        </h2>
        {queue.length === 0 && <p className="mt-3 text-sm text-muted">Nothing waiting — all bookings are scheduled.</p>}
        {queue.length > 0 && (
          <ul className="mt-3 flex flex-col gap-3">
            {queue.map(b => (
              <li key={b.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-text">{b.reference}</span>
                  <span className="text-muted">{b.companyName}</span>
                </div>
                <p className="mt-1 text-text">
                  {b.customerName} — {b.collectionAddress}, {b.collectionPostcode}
                </p>
                <p className="text-muted">
                  {b.collectionWindow
                    ? `Week ${formatDate(b.collectionWindow.startDate)} – ${formatDate(b.collectionWindow.endDate)}`
                    : b.preferredDate
                      ? `Preferred ${formatDate(b.preferredDate)}`
                      : "No collection week yet"}{" "}
                  · {b.numberOfParcels} parcel{b.numberOfParcels === 1 ? "" : "s"}
                  {b.itemTypes.length > 0 && <> · {describeItems(b.itemTypes, b.itemTypeOther, b.vehicleType)}</>}
                </p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <div className="min-w-52 flex-1">
                    <Select
                      value={assignRouteByBooking[b.id]}
                      onValueChange={value => setAssignRouteByBooking(prev => ({ ...prev, [b.id]: value }))}
                      options={plannedRoutes.map(r => ({
                        value: r.id,
                        label: `${formatDate(r.routeDate)} — ${r.driverVehicleReference ?? "van"} (${r.stopCount} stops)`,
                      }))}
                      placeholder={plannedRoutes.length === 0 ? "No planned routes — create one on the Routes tab" : "Choose a route"}
                    />
                  </div>
                  <Button
                    type="button"
                    size="md"
                    loading={assigningId === b.id}
                    disabled={!assignRouteByBooking[b.id]}
                    onClick={() => handleAssign(b.id)}
                  >
                    Assign
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {failed.length > 0 && (
        <Card className="mt-4">
          <h2 className="text-base font-semibold text-text">
            Failed collections <span className="font-normal text-muted">({failed.length})</span>
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {failed.map(b => (
              <li key={b.id} className="rounded-md border border-red/30 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-text">{b.reference}</span>
                  <span className="text-muted">{b.companyName}</span>
                </div>
                <p className="mt-1 text-text">
                  {b.customerName} — {b.collectionAddress}, {b.collectionPostcode}
                </p>
                {b.failureReason && <p className="text-red">Driver: “{b.failureReason}”</p>}
                <div className="mt-2">
                  <Button
                    type="button"
                    size="md"
                    variant="secondary"
                    loading={requeueingId === b.id}
                    onClick={() => handleRequeue(b.id)}
                  >
                    Requeue for collection
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
