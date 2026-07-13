"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useDispatchAuth } from "@/lib/dispatchContext";
import { collectUkDispatch, CollectUkAdminDriver, FulfilmentApiError } from "@/lib/api";

export default function DispatchDriversPage() {
  const { token, authFailure } = useDispatchAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<CollectUkAdminDriver[]>([]);
  const [newDriverUserId, setNewDriverUserId] = useState("");
  const [newDriverVehicle, setNewDriverVehicle] = useState("");
  const [creatingDriver, setCreatingDriver] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setDrivers(await collectUkDispatch.listDrivers(token));
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.status === 401) return authFailure();
      setLoadError(err instanceof FulfilmentApiError ? err.message : "Could not load drivers right now.");
    } finally {
      setLoading(false);
    }
  }, [token, authFailure]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreateDriver = async (e: FormEvent) => {
    e.preventDefault();
    if (!newDriverUserId.trim()) return;
    setCreatingDriver(true);
    try {
      await collectUkDispatch.createDriver(token, {
        userId: newDriverUserId.trim(),
        vehicleReference: newDriverVehicle.trim() || undefined,
      });
      toast({ title: "Driver registered", tone: "success" });
      setNewDriverUserId("");
      setNewDriverVehicle("");
      await load();
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.status === 401) return authFailure();
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not register the driver", tone: "error" });
    } finally {
      setCreatingDriver(false);
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
      <h1 className="text-xl font-semibold text-text">Drivers</h1>

      <Card className="mt-4">
        <h2 className="text-base font-semibold text-text">
          Registered drivers <span className="font-normal text-muted">({drivers.length})</span>
        </h2>
        {drivers.length === 0 && <p className="mt-3 text-sm text-muted">No drivers registered yet.</p>}
        {drivers.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {drivers.map(d => (
              <li key={d.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                <span className="font-medium text-text">{d.vehicleReference ?? "(no vehicle ref)"}</span>
                <span className="flex items-center gap-3 text-muted">
                  capacity {d.capacityParcels}
                  <StatusBadge label={d.status} tone={d.status === "ACTIVE" ? "success" : "neutral"} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="text-base font-semibold text-text">Register a driver</h2>
        <form onSubmit={handleCreateDriver} className="mt-3 flex flex-col gap-4">
          <Field label="User ID" hint="The driver's Faira account id (they must sign up first)" required>
            {p => <Input {...p} value={newDriverUserId} onChange={e => setNewDriverUserId(e.target.value)} />}
          </Field>
          <Field label="Vehicle reference" hint="Optional, e.g. VAN-1">
            {p => <Input {...p} value={newDriverVehicle} onChange={e => setNewDriverVehicle(e.target.value)} />}
          </Field>
          <Button type="submit" size="md" loading={creatingDriver} disabled={!newDriverUserId.trim()}>
            Register driver
          </Button>
        </form>
      </Card>
    </>
  );
}
