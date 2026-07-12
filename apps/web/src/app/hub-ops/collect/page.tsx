"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FileUpload, UploadState } from "@/components/ui/FileUpload";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase";
import {
  hubOps as hubOpsApi,
  HubOpsCollectionShipment,
  FulfilmentApiError,
  uploadParcelEvidencePhoto,
} from "@/lib/api";

const COLLECTIBLE_STATUSES = ["READY_FOR_COLLECTION", "COLLECTION_OVERDUE"];

export default function HubOpsCollectPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [reference, setReference] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [shipment, setShipment] = useState<HubOpsCollectionShipment | null>(null);

  const [code, setCode] = useState("");
  const [idCheckPerformed, setIdCheckPerformed] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [photo, setPhoto] = useState<{ file: File; previewUrl: string; publicId: string | null; state: UploadState } | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);

  const handleSignOut = async () => {
    await createClient().auth.signOut();
    router.push("/login");
  };

  const resetForm = () => {
    setCode("");
    setIdCheckPerformed(false);
    setOverrideReason("");
    setPhoto(null);
    setCollectError(null);
  };

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!reference.trim()) return;

    setSearching(true);
    setSearchError(null);
    setShipment(null);
    resetForm();
    try {
      const result = await hubOpsApi.searchAtDestination(reference.trim());
      setShipment(result);
    } catch (err) {
      setSearchError(err instanceof FulfilmentApiError ? err.message : "Could not look up that reference right now.");
    } finally {
      setSearching(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    setPhoto({ file, previewUrl, publicId: null, state: "uploading" });
    try {
      const params = await hubOpsApi.getEvidenceUploadParams();
      const publicId = await uploadParcelEvidencePhoto(params, file);
      setPhoto({ file, previewUrl, publicId, state: "success" });
    } catch {
      setPhoto({ file, previewUrl, publicId: null, state: "error" });
    }
  };

  const canCollect = shipment && COLLECTIBLE_STATUSES.includes(shipment.status);

  const handleCollect = async (e: FormEvent) => {
    e.preventDefault();
    if (!shipment || code.length !== 6) return;

    setCollecting(true);
    setCollectError(null);
    try {
      await hubOpsApi.collect(shipment.id, {
        code,
        idCheckPerformed,
        idCheckOverrideReason: overrideReason.trim() || undefined,
        proofImageUrl: photo?.publicId ?? undefined,
      });
      toast({ title: `${shipment.reference ?? "Shipment"} collected`, tone: "success" });
      setShipment(null);
      setReference("");
      resetForm();
    } catch (err) {
      setCollectError(err instanceof FulfilmentApiError ? err.message : "Could not complete this collection right now.");
    } finally {
      setCollecting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3">
          <span className="text-lg font-semibold text-primary">Faira Fulfilment — Hub Ops</span>
          <nav className="flex items-center gap-4">
            <Link href="/hub-ops/arrival" className="text-sm font-medium text-muted hover:text-text">
              Arrival scan
            </Link>
            <Button variant="ghost" size="md" onClick={handleSignOut}>
              Sign out
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="text-xl font-semibold text-text">Release a parcel to its buyer</h1>
        <p className="mt-1 text-sm text-muted">Search by reference, then verify the buyer&apos;s collection code.</p>

        <Card className="mt-6">
          <form onSubmit={handleSearch} className="flex flex-col gap-4">
            <Field label="Shipment reference" required>
              {p => (
                <Input {...p} value={reference} onChange={e => setReference(e.target.value)} placeholder="FF-BUL-000123" autoFocus />
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
              <StatusBadge label={shipment.displayStatus} tone={canCollect ? "info" : "neutral"} />
            </div>

            <dl className="mt-4 flex flex-col gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Buyer</dt>
                <dd className="text-right text-text">{shipment.buyerName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Buyer contact</dt>
                <dd className="text-right text-text">{shipment.buyerContact}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Declared value</dt>
                <dd className="text-right text-text">${shipment.declaredValue}</dd>
              </div>
            </dl>

            {!canCollect && (
              <div className="mt-4">
                <Alert tone="warning">This shipment isn&apos;t ready for collection.</Alert>
              </div>
            )}

            {canCollect && (
              <form onSubmit={handleCollect} className="mt-4 flex flex-col gap-4">
                {shipment.requiresIdCheck && (
                  <Alert tone="warning">
                    This parcel&apos;s declared value requires an ID check before release.
                  </Alert>
                )}

                <Field label="Collection code" hint="Ask the buyer for the 6-digit code sent by SMS" required>
                  {p => (
                    <Input
                      {...p}
                      value={code}
                      onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      placeholder="123456"
                    />
                  )}
                </Field>

                <Checkbox
                  id="id-check"
                  checked={idCheckPerformed}
                  onCheckedChange={setIdCheckPerformed}
                  label="I have checked the buyer's ID"
                />

                {shipment.requiresIdCheck && !idCheckPerformed && (
                  <Field
                    label="Supervisor override reason"
                    hint="Only a hub supervisor can release this parcel without an ID check"
                  >
                    {p => (
                      <Textarea
                        {...p}
                        value={overrideReason}
                        onChange={e => setOverrideReason(e.target.value)}
                        placeholder="e.g. Buyer's ID confirmed by phone with the seller"
                      />
                    )}
                  </Field>
                )}

                <div className="flex flex-col gap-3">
                  <span className="text-sm font-medium text-text">Proof of collection (optional)</span>
                  {photo ? (
                    <FileUpload
                      label="Photo"
                      state={photo.state}
                      previewUrl={photo.previewUrl}
                      fileName={photo.file.name}
                      onSelect={() => {}}
                      onRetry={() => uploadPhoto(photo.file)}
                      onRemove={() => setPhoto(null)}
                    />
                  ) : (
                    <FileUpload label="Add a photo" state="idle" onSelect={uploadPhoto} />
                  )}
                </div>

                {collectError && <Alert tone="error">{collectError}</Alert>}

                <Button type="submit" size="lg" loading={collecting} disabled={code.length !== 6}>
                  Confirm collection
                </Button>
              </form>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}
