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
import { CollectBrand } from "@/components/collect-uk/CollectBrand";
import { describeItems } from "@/lib/collectUkItemLabels";
import { getDispatchToken, setDispatchToken, clearDispatchToken } from "@/lib/dispatchToken";
import {
  collectUkDispatch,
  CollectUkUnscheduledBooking,
  CollectUkFailedBooking,
  CollectUkAdminCompany,
  CollectUkAdminDriver,
  CollectUkAdminRouteSummary,
  FulfilmentApiError,
} from "@/lib/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const ROUTE_STATUS_TONE = { PLANNED: "info", IN_PROGRESS: "warning", COMPLETED: "success" } as const;

export default function DispatchPage() {
  const { toast } = useToast();

  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenChecking, setTokenChecking] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queue, setQueue] = useState<CollectUkUnscheduledBooking[]>([]);
  const [failed, setFailed] = useState<CollectUkFailedBooking[]>([]);
  const [drivers, setDrivers] = useState<CollectUkAdminDriver[]>([]);
  const [routes, setRoutes] = useState<CollectUkAdminRouteSummary[]>([]);
  const [requeueingId, setRequeueingId] = useState<string | null>(null);
  const [companies, setCompanies] = useState<CollectUkAdminCompany[]>([]);
  const [rateCompanyId, setRateCompanyId] = useState<string | undefined>(undefined);
  const [rateBase, setRateBase] = useState("");
  const [rateSmall, setRateSmall] = useState("");
  const [rateMedium, setRateMedium] = useState("");
  const [rateLarge, setRateLarge] = useState("");
  const [rateXl, setRateXl] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  const [assignRouteByBooking, setAssignRouteByBooking] = useState<Record<string, string>>({});
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const [newRouteDriverId, setNewRouteDriverId] = useState<string | undefined>(undefined);
  const [newRouteDate, setNewRouteDate] = useState("");
  const [creatingRoute, setCreatingRoute] = useState(false);

  const [newDriverUserId, setNewDriverUserId] = useState("");
  const [newDriverVehicle, setNewDriverVehicle] = useState("");
  const [creatingDriver, setCreatingDriver] = useState(false);

  useEffect(() => {
    setToken(getDispatchToken());
    setReady(true);
  }, []);

  const handleAuthFailure = useCallback(() => {
    clearDispatchToken();
    setToken(null);
    setTokenError("That admin token was rejected. Please enter it again.");
  }, []);

  const loadAll = useCallback(
    async (activeToken: string) => {
      setLoading(true);
      setLoadError(null);
      try {
        const [q, f, d, r, c] = await Promise.all([
          collectUkDispatch.listUnscheduled(activeToken),
          collectUkDispatch.listFailed(activeToken),
          collectUkDispatch.listDrivers(activeToken),
          collectUkDispatch.listRoutes(activeToken),
          collectUkDispatch.listCompanies(activeToken),
        ]);
        setQueue(q);
        setFailed(f);
        setDrivers(d);
        setRoutes(r);
        setCompanies(c);
      } catch (err) {
        if (err instanceof FulfilmentApiError && err.status === 401) {
          handleAuthFailure();
          return;
        }
        setLoadError(err instanceof FulfilmentApiError ? err.message : "Could not load dispatch data right now.");
      } finally {
        setLoading(false);
      }
    },
    [handleAuthFailure],
  );

  useEffect(() => {
    if (token) void loadAll(token);
  }, [token, loadAll]);

  const handleTokenSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const candidate = tokenInput.trim();
    if (!candidate) return;
    setTokenChecking(true);
    setTokenError(null);
    try {
      await collectUkDispatch.listDrivers(candidate); // cheap auth probe
      setDispatchToken(candidate);
      setToken(candidate);
      setTokenInput("");
    } catch (err) {
      setTokenError(
        err instanceof FulfilmentApiError && err.status === 401
          ? "That token was rejected — check it and try again."
          : "Could not verify the token right now.",
      );
    } finally {
      setTokenChecking(false);
    }
  };

  const handleAssign = async (bookingId: string) => {
    if (!token) return;
    const routeId = assignRouteByBooking[bookingId];
    if (!routeId) return;
    setAssigningId(bookingId);
    try {
      await collectUkDispatch.assignStop(token, routeId, bookingId);
      toast({ title: "Booking assigned to route", tone: "success" });
      await loadAll(token);
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.status === 401) return handleAuthFailure();
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not assign this booking", tone: "error" });
    } finally {
      setAssigningId(null);
    }
  };

  const handleRequeue = async (bookingId: string) => {
    if (!token) return;
    setRequeueingId(bookingId);
    try {
      await collectUkDispatch.requeueBooking(token, bookingId);
      toast({ title: "Booking returned to the queue", tone: "success" });
      await loadAll(token);
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.status === 401) return handleAuthFailure();
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not requeue this booking", tone: "error" });
    } finally {
      setRequeueingId(null);
    }
  };

  const poundsToPence = (v: string) => Math.round(Number.parseFloat(v) * 100);
  const rateInputsValid = [rateBase, rateSmall, rateMedium, rateLarge, rateXl].every(
    v => v.trim() !== "" && Number.isFinite(Number.parseFloat(v)) && Number.parseFloat(v) >= 0,
  );

  const handleSaveRate = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !rateCompanyId || !rateInputsValid) return;
    setSavingRate(true);
    try {
      await collectUkDispatch.setCompanyRate(token, rateCompanyId, {
        basePerStopPence: poundsToPence(rateBase),
        tierSmallPence: poundsToPence(rateSmall),
        tierMediumPence: poundsToPence(rateMedium),
        tierLargePence: poundsToPence(rateLarge),
        tierXlPence: poundsToPence(rateXl),
      });
      toast({ title: "Rate saved", tone: "success" });
      await loadAll(token);
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.status === 401) return handleAuthFailure();
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not save the rate", tone: "error" });
    } finally {
      setSavingRate(false);
    }
  };

  const handleCreateRoute = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !newRouteDriverId || !newRouteDate) return;
    setCreatingRoute(true);
    try {
      await collectUkDispatch.createRoute(token, { driverId: newRouteDriverId, routeDate: newRouteDate });
      toast({ title: "Route created", tone: "success" });
      setNewRouteDate("");
      await loadAll(token);
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.status === 401) return handleAuthFailure();
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not create the route", tone: "error" });
    } finally {
      setCreatingRoute(false);
    }
  };

  const handleCreateDriver = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !newDriverUserId.trim()) return;
    setCreatingDriver(true);
    try {
      await collectUkDispatch.createDriver(token, {
        userId: newDriverUserId.trim(),
        vehicleReference: newDriverVehicle.trim() || undefined,
      });
      toast({ title: "Driver registered", tone: "success" });
      setNewDriverUserId("");
      setNewDriverVehicle("");
      await loadAll(token);
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.status === 401) return handleAuthFailure();
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not register the driver", tone: "error" });
    } finally {
      setCreatingDriver(false);
    }
  };

  const plannedRoutes = routes.filter(r => r.status === "PLANNED");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <CollectBrand suffix="Dispatch" />
          {token && (
            <Button type="button" variant="ghost" size="md" onClick={() => { clearDispatchToken(); setToken(null); }}>
              Lock
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        {ready && !token && (
          <Card className="mx-auto max-w-md">
            <h1 className="text-lg font-semibold text-text">Faira dispatch</h1>
            <p className="mt-1 text-sm text-muted">
              Internal tool for scheduling collections across every company. Enter the Faira admin token to
              continue — it stays in this tab only.
            </p>
            <form onSubmit={handleTokenSubmit} className="mt-4 flex flex-col gap-4">
              <Field label="Admin token" required>
                {p => <Input {...p} type="password" value={tokenInput} onChange={e => setTokenInput(e.target.value)} />}
              </Field>
              {tokenError && <Alert tone="error">{tokenError}</Alert>}
              <Button type="submit" size="md" loading={tokenChecking} disabled={!tokenInput.trim()}>
                Unlock dispatch
              </Button>
            </form>
          </Card>
        )}

        {token && (
          <>
            <h1 className="text-xl font-semibold text-text">Dispatch board</h1>

            {loading && (
              <Card className="mt-4 flex flex-col gap-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-full" />
              </Card>
            )}
            {!loading && loadError && (
              <div className="mt-4">
                <Alert tone="error">{loadError}</Alert>
              </div>
            )}

            {!loading && !loadError && (
              <>
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
                                placeholder={plannedRoutes.length === 0 ? "No planned routes — create one below" : "Choose a route"}
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

                <Card className="mt-4">
                  <h2 className="text-base font-semibold text-text">Routes</h2>
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

                  <form onSubmit={handleCreateRoute} className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
                    <h3 className="text-sm font-medium text-text">Create a route</h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="Driver" required>
                        {p => (
                          <Select
                            {...p}
                            value={newRouteDriverId}
                            onValueChange={setNewRouteDriverId}
                            options={drivers.map(d => ({ value: d.id, label: d.vehicleReference ?? d.id.slice(0, 8) }))}
                            placeholder={drivers.length === 0 ? "Register a driver first" : "Choose a driver"}
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
                  <h2 className="text-base font-semibold text-text">Company rates</h2>
                  <p className="mt-1 text-sm text-muted">
                    What Faira charges each company: base per stop + per parcel by size. Charges are
                    snapshotted when the company confirms a handover.
                  </p>
                  {companies.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-2">
                      {companies.map(c => (
                        <li key={c.id}>
                          <Link
                            href={`/collect-uk/dispatch/companies/${c.id}`}
                            className="flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm transition-colors duration-200 hover:border-primary"
                          >
                            <span className="font-medium text-text">{c.name}</span>
                            <span className="text-muted">
                              {c.rate
                                ? `£${(c.rate.basePerStopPence / 100).toFixed(2)}/stop + £${(c.rate.tierSmallPence / 100).toFixed(2)}–£${(c.rate.tierXlPence / 100).toFixed(2)}/parcel`
                                : "no rate set"}{" "}
                              →
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <form onSubmit={handleSaveRate} className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
                    <h3 className="text-sm font-medium text-text">Set a company&rsquo;s rate (£)</h3>
                    <Field label="Company" required>
                      {p => (
                        <Select
                          {...p}
                          value={rateCompanyId}
                          onValueChange={setRateCompanyId}
                          options={companies.map(c => ({ value: c.id, label: c.name }))}
                          placeholder="Choose a company"
                        />
                      )}
                    </Field>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                      <Field label="Per stop" required>
                        {p => <Input {...p} type="number" min={0} step="0.01" value={rateBase} onChange={e => setRateBase(e.target.value)} />}
                      </Field>
                      <Field label="Small" required>
                        {p => <Input {...p} type="number" min={0} step="0.01" value={rateSmall} onChange={e => setRateSmall(e.target.value)} />}
                      </Field>
                      <Field label="Medium" required>
                        {p => <Input {...p} type="number" min={0} step="0.01" value={rateMedium} onChange={e => setRateMedium(e.target.value)} />}
                      </Field>
                      <Field label="Large" required>
                        {p => <Input {...p} type="number" min={0} step="0.01" value={rateLarge} onChange={e => setRateLarge(e.target.value)} />}
                      </Field>
                      <Field label="XL" required>
                        {p => <Input {...p} type="number" min={0} step="0.01" value={rateXl} onChange={e => setRateXl(e.target.value)} />}
                      </Field>
                    </div>
                    <Button type="submit" size="md" loading={savingRate} disabled={!rateCompanyId || !rateInputsValid}>
                      Save rate
                    </Button>
                  </form>
                </Card>

                <Card className="mt-4">
                  <h2 className="text-base font-semibold text-text">Drivers</h2>
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

                  <form onSubmit={handleCreateDriver} className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
                    <h3 className="text-sm font-medium text-text">Register a driver</h3>
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
            )}
          </>
        )}
      </main>
    </div>
  );
}
