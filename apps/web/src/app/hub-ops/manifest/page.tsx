"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase";
import {
  hubOps as hubOpsApi,
  manifests as manifestsApi,
  transport as transportApi,
  hubs as hubsApi,
  Hub,
  TransportRoute,
  TransportRun,
  ManifestDetail,
  FulfilmentApiError,
} from "@/lib/api";

export default function HubOpsManifestPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hubOptions, setHubOptions] = useState<Hub[]>([]);
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [runs, setRuns] = useState<TransportRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(undefined);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<ManifestDetail | null>(null);

  const [reference, setReference] = useState("");
  const [addingParcel, setAddingParcel] = useState(false);
  const [addParcelError, setAddParcelError] = useState<string | null>(null);

  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [viewingDocument, setViewingDocument] = useState(false);

  const handleSignOut = async () => {
    await createClient().auth.signOut();
    router.push("/login");
  };

  useEffect(() => {
    Promise.all([hubsApi.list(), transportApi.listRoutes(), transportApi.listRuns()])
      .then(([hubResult, routeResult, runResult]) => {
        setHubOptions(hubResult);
        setRoutes(routeResult);
        setRuns(runResult);
      })
      .catch(() => setLoadError("Could not load routes and runs right now."))
      .finally(() => setLoading(false));
  }, []);

  const hubName = (hubId: string) => hubOptions.find(h => h.id === hubId)?.name ?? hubId;
  const routeFor = (routeId: string) => routes.find(r => r.id === routeId);

  const runOptions = runs.map(run => {
    const route = routeFor(run.routeId);
    const vehicle = run.vehicleReference ? ` (${run.vehicleReference})` : "";
    const label = route
      ? `${hubName(route.originHubId)} → ${hubName(route.destinationHubId)} — ${new Date(run.scheduledDeparture).toLocaleString()}${vehicle}`
      : run.id;
    return { value: run.id, label };
  });

  const loadExistingManifest = async (manifestId: string) => {
    const result = await manifestsApi.get(manifestId);
    setManifest(result);
  };

  const handleCreateManifest = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedRunId) return;

    setCreating(true);
    setCreateError(null);
    try {
      const created = await manifestsApi.create(selectedRunId);
      await loadExistingManifest(created.id);
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.code === "ALREADY_EXISTS") {
        const existingId = (err.details as { manifestId?: string } | null)?.manifestId;
        if (existingId) {
          await loadExistingManifest(existingId);
          return;
        }
      }
      setCreateError(err instanceof FulfilmentApiError ? err.message : "Could not create a manifest for this run right now.");
    } finally {
      setCreating(false);
    }
  };

  const handleAddParcel = async (e: FormEvent) => {
    e.preventDefault();
    if (!manifest || !reference.trim()) return;

    setAddingParcel(true);
    setAddParcelError(null);
    try {
      const shipment = await hubOpsApi.search(reference.trim());
      await manifestsApi.addParcel(manifest.id, shipment.id);
      await loadExistingManifest(manifest.id);
      setReference("");
      toast({ title: `${shipment.reference} added to manifest`, tone: "success" });
    } catch (err) {
      setAddParcelError(err instanceof FulfilmentApiError ? err.message : "Could not add this parcel right now.");
    } finally {
      setAddingParcel(false);
    }
  };

  const handleRemoveParcel = async (shipmentId: string) => {
    if (!manifest) return;
    try {
      await manifestsApi.removeParcel(manifest.id, shipmentId);
      await loadExistingManifest(manifest.id);
      toast({ title: "Parcel removed from manifest", tone: "success" });
    } catch (err) {
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not remove this parcel", tone: "error" });
    }
  };

  const handleFinalize = async () => {
    if (!manifest) return;
    setFinalizing(true);
    setFinalizeError(null);
    try {
      const result = await manifestsApi.finalize(manifest.id);
      setManifest({ ...manifest, status: result.status, finalizedAt: result.finalizedAt, finalizedById: result.finalizedById });
      toast({ title: "Manifest finalized", tone: "success" });
    } catch (err) {
      setFinalizeError(err instanceof FulfilmentApiError ? err.message : "Could not finalize this manifest right now.");
    } finally {
      setFinalizing(false);
    }
  };

  const handleViewDocument = async () => {
    if (!manifest) return;
    setViewingDocument(true);
    try {
      const text = await manifestsApi.getDocument(manifest.id);
      const blobUrl = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
      window.open(blobUrl, "_blank");
    } catch (err) {
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not generate the manifest document", tone: "error" });
    } finally {
      setViewingDocument(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3">
          <span className="text-lg font-semibold text-primary">Faira Fulfilment — Hub Ops</span>
          <nav className="flex items-center gap-4">
            <Link href="/hub-ops/inspect" className="text-sm font-medium text-muted hover:text-text">
              Inspect &amp; seal
            </Link>
            <Button variant="ghost" size="md" onClick={handleSignOut}>
              Sign out
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="text-xl font-semibold text-text">Dispatch manifest</h1>
        <p className="mt-1 text-sm text-muted">Assign sealed parcels to a scheduled run, then finalize the manifest for dispatch.</p>

        {loading ? (
          <Skeleton className="mt-6 h-40 w-full" />
        ) : loadError ? (
          <div className="mt-6">
            <Alert tone="error">{loadError}</Alert>
          </div>
        ) : (
          !manifest && (
            <Card className="mt-6">
              <form onSubmit={handleCreateManifest} className="flex flex-col gap-4">
                <Field label="Scheduled run" required>
                  {p => (
                    <Select
                      {...p}
                      value={selectedRunId}
                      onValueChange={setSelectedRunId}
                      options={runOptions}
                      placeholder="Choose a run"
                    />
                  )}
                </Field>
                {createError && <Alert tone="error">{createError}</Alert>}
                <Button type="submit" size="lg" loading={creating} disabled={!selectedRunId}>
                  Open manifest
                </Button>
              </form>
            </Card>
          )
        )}

        {manifest && (
          <Card className="mt-6">
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-text">Manifest</span>
              <StatusBadge label={manifest.status} tone={manifest.status === "FINALIZED" ? "success" : "info"} />
            </div>

            <div className="mt-4 flex flex-col gap-2">
              {manifest.parcels.length === 0 ? (
                <p className="text-sm text-muted">No parcels assigned yet.</p>
              ) : (
                manifest.parcels.map(parcel => (
                  <div key={parcel.shipmentId} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                    <div>
                      <p className="font-mono font-medium text-text">{parcel.reference}</p>
                      <p className="text-muted">
                        To {hubName(parcel.destinationHubId)} — {parcel.sizeTier.replaceAll("_", " ")}
                      </p>
                    </div>
                    {manifest.status === "OPEN" && (
                      <Button variant="ghost" size="md" onClick={() => handleRemoveParcel(parcel.shipmentId)}>
                        Remove
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>

            {manifest.status === "OPEN" && (
              <form onSubmit={handleAddParcel} className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
                <Field label="Add a sealed parcel by reference">
                  {p => (
                    <Input {...p} value={reference} onChange={e => setReference(e.target.value)} placeholder="FF-HRE-000123" />
                  )}
                </Field>
                {addParcelError && <Alert tone="error">{addParcelError}</Alert>}
                <Button type="submit" size="md" loading={addingParcel} disabled={!reference.trim()}>
                  Add to manifest
                </Button>
              </form>
            )}

            <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
              {finalizeError && <Alert tone="error">{finalizeError}</Alert>}
              <div className="flex gap-3">
                {manifest.status === "OPEN" && (
                  <Button
                    size="lg"
                    onClick={handleFinalize}
                    loading={finalizing}
                    disabled={manifest.parcels.length === 0}
                  >
                    Finalize manifest
                  </Button>
                )}
                <Button variant="secondary" size="lg" onClick={handleViewDocument} loading={viewingDocument}>
                  View manifest document
                </Button>
              </div>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
