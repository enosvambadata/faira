"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useDispatchAuth } from "@/lib/dispatchContext";
import { collectUkDispatch, CollectUkAdminDriver, CollectUkAdminRouteSummary, FulfilmentApiError } from "@/lib/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const ROUTE_STATUS_TONE = { PLANNED: "info", IN_PROGRESS: "warning", COMPLETED: "success" } as const;

export default function DispatchRoutesPage() {
  const { token, authFailure } = useDispatchAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [routes, setRoutes] = useState<CollectUkAdminRouteSummary[]>([]);
  const [drivers, setDrivers] = useState<CollectUkAdminDriver[]>([]);
  const [newRouteDriverId, setNewRouteDriverId] = useState<string | undefined>(undefined);
  const [newRouteDate, setNewRouteDate] = useState("");
  const [creatingRoute, setCreatingRoute] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [r, d] = await Promise.all([collectUkDispatch.listRoutes(token), collectUkDispatch.listDrivers(token)]);
      setRoutes(r);
      setDrivers(d);
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.status === 401) return authFailure();
      setLoadError(err instanceof FulfilmentApiError ? err.message : "Could not load routes right now.");
    } finally {
      setLoading(false);
    }
  }, [token, authFailure]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreateRoute = async (e: FormEvent) => {
    e.preventDefault();
    if (!newRouteDriverId || !newRouteDate) return;
    setCreatingRoute(true);
    try {
      await collectUkDispatch.createRoute(token, { driverId: newRouteDriverId, routeDate: newRouteDate });
      toast({ title: "Route created", tone: "success" });
      setNewRouteDate("");
      await load();
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.status === 401) return authFailure();
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not create the route", tone: "error" });
    } finally {
      setCreatingRoute(false);
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
      <h1 className="text-xl font-semibold text-text">Routes</h1>

      <Card className="mt-4">
        <h2 className="text-base font-semibold text-text">Create a route</h2>
        <form onSubmit={handleCreateRoute} className="mt-3 flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Driver" required>
              {p => (
                <Select
                  {...p}
                  value={newRouteDriverId}
                  onValueChange={setNewRouteDriverId}
                  options={drivers.map(d => ({ value: d.id, label: d.vehicleReference ?? d.id.slice(0, 8) }))}
                  placeholder={drivers.length === 0 ? "Register a driver first (Drivers tab)" : "Choose a driver"}
                />
              )}
            </Field>
            <Field label="Route date" required>
              {p => <Input {...p} type="date" value={newRouteDate} onChange={e => setNewRouteDate(e.target.value)} />}
            </Field>
          </div>
          <Button type="submit" size="md" loading={creatingRoute} disabled={!newRouteDriverId || !newRouteDate}>
            Create route
          </Button>
        </form>
      </Card>

      <Card className="mt-4">
        <h2 className="text-base font-semibold text-text">
          All routes <span className="font-normal text-muted">({routes.length})</span>
        </h2>
        {routes.length === 0 && <p className="mt-3 text-sm text-muted">No routes yet.</p>}
        {routes.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {routes.map(r => (
              <li key={r.id}>
                <Link
                  href={`/collect-uk/dispatch/routes/${r.id}`}
                  className="flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm transition-colors duration-200 hover:border-primary"
                >
                  <span className="font-medium text-text">
                    {formatDate(r.routeDate)} — {r.driverVehicleReference ?? "van"}
                  </span>
                  <span className="flex items-center gap-3 text-muted">
                    {r.stopCount - r.pendingStopCount}/{r.stopCount} stops done
                    {r.totalDistanceMiles != null && <span>{r.totalDistanceMiles} mi</span>}
                    <StatusBadge label={r.status.replaceAll("_", " ")} tone={ROUTE_STATUS_TONE[r.status]} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
