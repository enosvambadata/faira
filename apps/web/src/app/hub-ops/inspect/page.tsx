"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FileUpload, UploadState } from "@/components/ui/FileUpload";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase";
import {
  hubOps as hubOpsApi,
  HubOpsShipment,
  ParcelCondition,
  FulfilmentApiError,
  uploadParcelEvidencePhoto,
} from "@/lib/api";

const CONDITION_OPTIONS: { value: ParcelCondition; label: string }[] = [
  { value: "GOOD", label: "Good — no visible issues" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "SUSPICIOUS", label: "Suspicious — needs a closer look" },
];

// Mirrors apps/api/src/routes/hubOps.ts's PRE_SEAL_STATUSES -- a label can
// be printed (or reprinted) for a SEALED shipment or anything later in the
// pipeline, not just the instant it's sealed.
const PRE_SEAL_STATUSES = [
  "DRAFT",
  "AWAITING_PAYMENT",
  "AWAITING_DROPOFF",
  "DROPOFF_OVERDUE",
  "RECEIVED_AT_ORIGIN",
  "INSPECTED",
  "REJECTED_AT_ORIGIN",
];

interface PhotoSlot {
  file: File;
  previewUrl: string;
  publicId: string | null;
  state: UploadState;
  error: string | null;
}

export default function HubOpsInspectPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [reference, setReference] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [shipment, setShipment] = useState<HubOpsShipment | null>(null);

  const [weightKg, setWeightKg] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [condition, setCondition] = useState<ParcelCondition | undefined>(undefined);
  const [photos, setPhotos] = useState<PhotoSlot[]>([]);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

  const [sealNumber, setSealNumber] = useState("");
  const [sealing, setSealing] = useState(false);
  const [sealError, setSealError] = useState<string | null>(null);

  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const handleSignOut = async () => {
    await createClient().auth.signOut();
    router.push("/login");
  };

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!reference.trim()) return;

    setSearching(true);
    setSearchError(null);
    setShipment(null);
    setPhotos([]);
    setWeightKg("");
    setDimensions("");
    setCondition(undefined);
    setSealNumber("");
    setInspectError(null);
    setSealError(null);
    try {
      const result = await hubOpsApi.search(reference.trim());
      setShipment(result);
    } catch (err) {
      setSearchError(err instanceof FulfilmentApiError ? err.message : "Could not look up that reference right now.");
    } finally {
      setSearching(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    const index = photos.length;
    setPhotos(prev => [...prev, { file, previewUrl, publicId: null, state: "uploading", error: null }]);

    try {
      const params = await hubOpsApi.getEvidenceUploadParams();
      const publicId = await uploadParcelEvidencePhoto(params, file);
      setPhotos(prev => prev.map((p, i) => (i === index ? { ...p, publicId, state: "success" } : p)));
    } catch {
      setPhotos(prev =>
        prev.map((p, i) => (i === index ? { ...p, state: "error", error: "Upload failed" } : p)),
      );
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const canInspect = shipment?.status === "RECEIVED_AT_ORIGIN";
  const canSeal = shipment?.status === "INSPECTED";
  const canPrintLabel = !!shipment && !PRE_SEAL_STATUSES.includes(shipment.status);
  const successfulPhotoIds = photos.filter(p => p.state === "success" && p.publicId).map(p => p.publicId!);

  const handleInspect = async (e: FormEvent) => {
    e.preventDefault();
    if (!shipment || !condition || successfulPhotoIds.length === 0) return;

    setInspecting(true);
    setInspectError(null);
    try {
      const result = await hubOpsApi.inspect(shipment.id, {
        weightKg: Number(weightKg),
        dimensions: dimensions.trim(),
        condition,
        photoPublicIds: successfulPhotoIds,
      });
      setShipment({ ...shipment, status: result.status, displayStatus: result.displayStatus });
      toast({ title: "Parcel inspected", tone: "success" });
    } catch (err) {
      setInspectError(err instanceof FulfilmentApiError ? err.message : "Could not record this inspection right now.");
    } finally {
      setInspecting(false);
    }
  };

  const handleSeal = async (e: FormEvent) => {
    e.preventDefault();
    if (!shipment || !sealNumber.trim()) return;

    setSealing(true);
    setSealError(null);
    try {
      const result = await hubOpsApi.seal(shipment.id, sealNumber.trim());
      setShipment({ ...shipment, status: result.status, displayStatus: result.displayStatus });
      toast({ title: "Parcel sealed", tone: "success" });
    } catch (err) {
      setSealError(err instanceof FulfilmentApiError ? err.message : "Could not seal this parcel right now.");
    } finally {
      setSealing(false);
    }
  };

  const handlePrintLabel = async () => {
    if (!shipment) return;
    setPrinting(true);
    setPrintError(null);
    try {
      const svg = await hubOpsApi.getLabelSvg(shipment.id);
      const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      window.open(blobUrl, "_blank");
    } catch (err) {
      setPrintError(err instanceof FulfilmentApiError ? err.message : "Could not generate the label right now.");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3">
          <span className="text-lg font-semibold text-primary">Faira Fulfilment — Hub Ops</span>
          <nav className="flex items-center gap-4">
            <Link href="/hub-ops/dropoff" className="text-sm font-medium text-muted hover:text-text">
              Accept drop-off
            </Link>
            <Link href="/hub-ops/manifest" className="text-sm font-medium text-muted hover:text-text">
              Manifest
            </Link>
            <Button variant="ghost" size="md" onClick={handleSignOut}>
              Sign out
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="text-xl font-semibold text-text">Inspect and seal a parcel</h1>
        <p className="mt-1 text-sm text-muted">Search for a parcel that&apos;s already been received at this hub.</p>

        <Card className="mt-6">
          <form onSubmit={handleSearch} className="flex flex-col gap-4">
            <Field label="Shipment reference" required>
              {p => (
                <Input {...p} value={reference} onChange={e => setReference(e.target.value)} placeholder="FF-HRE-000123" autoFocus />
              )}
            </Field>
            {searchError && <Alert tone="error">{searchError}</Alert>}
            <Button type="submit" size="lg" loading={searching}>
              Search
            </Button>
          </form>
        </Card>

        {shipment && (
          <Card className="mt-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-lg font-semibold text-text">{shipment.reference}</span>
              <StatusBadge label={shipment.displayStatus} tone={canInspect || canSeal ? "info" : "neutral"} />
            </div>

            {!canInspect && !canSeal && !canPrintLabel && (
              <div className="mt-4">
                <Alert tone="warning">
                  This shipment isn&apos;t ready for inspection or sealing right now — it must be received at the hub
                  first.
                </Alert>
              </div>
            )}

            {canInspect && (
              <form onSubmit={handleInspect} className="mt-4 flex flex-col gap-4">
                <h2 className="text-base font-semibold text-text">Record inspection</h2>

                <Field label="Weight (kg)" required>
                  {p => <Input {...p} type="number" min="0" step="0.01" value={weightKg} onChange={e => setWeightKg(e.target.value)} />}
                </Field>

                <Field label="Dimensions" hint="e.g. 30x20x10cm" required>
                  {p => <Input {...p} value={dimensions} onChange={e => setDimensions(e.target.value)} />}
                </Field>

                <Field label="Condition" required>
                  {p => (
                    <Select
                      {...p}
                      value={condition}
                      onValueChange={value => setCondition(value as ParcelCondition)}
                      options={CONDITION_OPTIONS}
                      placeholder="Select condition"
                    />
                  )}
                </Field>

                <div className="flex flex-col gap-3">
                  <span className="text-sm font-medium text-text">Photos (at least 1 required)</span>
                  {photos.map((photo, index) => (
                    <FileUpload
                      key={index}
                      label={`Photo ${index + 1}`}
                      state={photo.state}
                      previewUrl={photo.previewUrl}
                      fileName={photo.file.name}
                      error={photo.error}
                      onSelect={() => {}}
                      onRetry={() => uploadPhoto(photo.file)}
                      onRemove={() => removePhoto(index)}
                    />
                  ))}
                  <FileUpload label="Add a photo" state="idle" onSelect={uploadPhoto} />
                </div>

                {inspectError && <Alert tone="error">{inspectError}</Alert>}

                <Button
                  type="submit"
                  size="lg"
                  loading={inspecting}
                  disabled={!weightKg || !dimensions.trim() || !condition || successfulPhotoIds.length === 0}
                >
                  Record inspection
                </Button>
              </form>
            )}

            {canSeal && (
              <form onSubmit={handleSeal} className="mt-4 flex flex-col gap-4">
                <h2 className="text-base font-semibold text-text">Apply seal</h2>
                <Field label="Seal number" required>
                  {p => <Input {...p} value={sealNumber} onChange={e => setSealNumber(e.target.value)} placeholder="SEAL-000123" />}
                </Field>
                {sealError && <Alert tone="error">{sealError}</Alert>}
                <Button type="submit" size="lg" loading={sealing} disabled={!sealNumber.trim()}>
                  Seal parcel
                </Button>
              </form>
            )}

            {canPrintLabel && (
              <div className="mt-4 flex flex-col gap-3">
                {shipment.status === "SEALED" && <Alert tone="success">This parcel is sealed and ready for dispatch.</Alert>}
                {printError && <Alert tone="error">{printError}</Alert>}
                <Button size="lg" variant="secondary" onClick={handlePrintLabel} loading={printing}>
                  Print label
                </Button>
              </div>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}
