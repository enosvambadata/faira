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
import { collectUkDispatch, CollectUkAdminDriver, CollectUkDriverApplication, FulfilmentApiError } from "@/lib/api";

export default function DispatchDriversPage() {
  const { token, authFailure } = useDispatchAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<CollectUkAdminDriver[]>([]);
  const [applications, setApplications] = useState<CollectUkDriverApplication[]>([]);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [newDriverUserId, setNewDriverUserId] = useState("");
  const [newDriverVehicle, setNewDriverVehicle] = useState("");
  const [creatingDriver, setCreatingDriver] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [d, a] = await Promise.all([
        collectUkDispatch.listDrivers(token),
        collectUkDispatch.listDriverApplications(token),
      ]);
      setDrivers(d);
      setApplications(a);
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

  const handleApprove = async (driverId: string) => {
    setDecidingId(driverId);
    try {
      await collectUkDispatch.approveDriver(token, driverId);
      toast({ title: "Driver approved", tone: "success" });
      await load();
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.status === 401) return authFailure();
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not approve", tone: "error" });
    } finally {
      setDecidingId(null);
    }
  };

  const handleReject = async (driverId: string) => {
    if (!rejectReason.trim()) return;
    setDecidingId(driverId);
    try {
      await collectUkDispatch.rejectDriver(token, driverId, rejectReason.trim());
      toast({ title: "Application rejected", tone: "success" });
      setRejectingId(null);
      setRejectReason("");
      await load();
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.status === 401) return authFailure();
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not reject", tone: "error" });
    } finally {
      setDecidingId(null);
    }
  };

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

      {applications.length > 0 && (
        <Card className="mt-4">
          <h2 className="text-base font-semibold text-text">
            Applications to review <span className="font-normal text-muted">({applications.length})</span>
          </h2>
          <p className="mt-1 text-sm text-muted">
            Check the licence and all three insurance documents before approving — approval makes the driver routable.
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {applications.map(a => (
              <li key={a.id} className="rounded-md border border-warning/40 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-text">{a.fullName}</span>
                  <span className="text-muted">{a.county} · {a.basePostcode}</span>
                </div>
                <p className="mt-1 text-muted">{a.phone}</p>

                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Vehicle{a.vehicles.length === 1 ? "" : "s"} ({a.vehicles.length})
                  </p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {a.vehicles.map((v, vi) => (
                      <li key={vi} className="flex flex-wrap items-center gap-2 text-text">
                        <span>
                          {v.makeModel} · <span className="font-mono">{v.registrationPlate}</span> · capacity {v.capacityParcels}
                        </span>
                        {v.photo ? (
                          <a
                            href={v.photo}
                            target="_blank"
                            rel="noreferrer"
                            className="cursor-pointer font-medium text-primary underline transition-colors duration-200 hover:text-primary-dark"
                          >
                            photo
                          </a>
                        ) : (
                          <span className="text-red">photo missing</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  {([
                    ["Driving licence", a.documents.drivingLicence],
                    ["Motor insurance", a.documents.motorInsurance],
                    ["Goods in Transit", a.documents.gitInsurance],
                    ["Public liability", a.documents.liability],
                  ] as const).map(([label, url]) =>
                    url ? (
                      <a
                        key={label}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="cursor-pointer font-medium text-primary underline transition-colors duration-200 hover:text-primary-dark"
                      >
                        {label}
                      </a>
                    ) : (
                      <span key={label} className="text-red">{label}: missing</span>
                    ),
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <Button
                    type="button"
                    size="md"
                    loading={decidingId === a.id && rejectingId !== a.id}
                    onClick={() => handleApprove(a.id)}
                  >
                    Approve
                  </Button>
                  {rejectingId !== a.id ? (
                    <Button type="button" variant="ghost" size="md" onClick={() => setRejectingId(a.id)}>
                      Reject…
                    </Button>
                  ) : (
                    <>
                      <div className="min-w-56 flex-1">
                        <Field label="Reason (sent context for the applicant)" required>
                          {p => <Input {...p} value={rejectReason} onChange={e => setRejectReason(e.target.value)} />}
                        </Field>
                      </div>
                      <Button
                        type="button"
                        variant="danger"
                        size="md"
                        loading={decidingId === a.id}
                        disabled={!rejectReason.trim()}
                        onClick={() => handleReject(a.id)}
                      >
                        Confirm reject
                      </Button>
                      <Button type="button" variant="ghost" size="md" onClick={() => { setRejectingId(null); setRejectReason(""); }}>
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

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
