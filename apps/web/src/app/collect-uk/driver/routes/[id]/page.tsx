"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { FileUpload, UploadState } from "@/components/ui/FileUpload";
import { useToast } from "@/components/ui/Toast";
import {
  collectUkDriverPortal,
  CollectUkDriverRouteDetail,
  CollectUkDriverStop,
  FulfilmentApiError,
  uploadParcelEvidencePhoto,
} from "@/lib/api";

const STOP_STATUS_TONE: Record<CollectUkDriverStop["status"], "neutral" | "success" | "error"> = {
  PENDING: "neutral",
  COLLECTED: "success",
  UNABLE_TO_COLLECT: "error",
};

function StopCard({ stop, onResolved }: { stop: CollectUkDriverStop; onResolved: (stopId: string, status: string) => void }) {
  const { toast } = useToast();
  const [photo, setPhoto] = useState<{ file: File; previewUrl: string; publicId: string | null; state: UploadState } | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [showFailForm, setShowFailForm] = useState(false);
  const [failureReason, setFailureReason] = useState("");
  const [failing, setFailing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const uploadPhoto = async (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    setPhoto({ file, previewUrl, publicId: null, state: "uploading" });
    try {
      const params = await collectUkDriverPortal.getEvidenceUploadParams();
      const publicId = await uploadParcelEvidencePhoto(params, file);
      setPhoto({ file, previewUrl, publicId, state: "success" });
    } catch {
      setPhoto({ file, previewUrl, publicId: null, state: "error" });
    }
  };

  const handleCollect = async () => {
    setCollecting(true);
    setActionError(null);
    try {
      await collectUkDriverPortal.collectStop(stop.id, { proofPhotoUrl: photo?.publicId ?? undefined });
      toast({ title: `${stop.bookingReference ?? "Parcel"} collected`, tone: "success" });
      onResolved(stop.id, "COLLECTED");
    } catch (err) {
      setActionError(err instanceof FulfilmentApiError ? err.message : "Could not record this collection right now.");
    } finally {
      setCollecting(false);
    }
  };

  const handleFail = async (e: FormEvent) => {
    e.preventDefault();
    if (!failureReason.trim()) return;
    setFailing(true);
    setActionError(null);
    try {
      await collectUkDriverPortal.unableToCollectStop(stop.id, failureReason.trim());
      toast({ title: "Marked unable to collect", tone: "success" });
      onResolved(stop.id, "UNABLE_TO_COLLECT");
    } catch (err) {
      setActionError(err instanceof FulfilmentApiError ? err.message : "Could not save this right now.");
    } finally {
      setFailing(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm text-muted">{stop.bookingReference}</span>
        <StatusBadge label={stop.status.replaceAll("_", " ")} tone={STOP_STATUS_TONE[stop.status]} />
      </div>

      <dl className="mt-3 flex flex-col gap-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Company</dt>
          <dd className="text-right text-text">{stop.companyName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Customer</dt>
          <dd className="text-right text-text">{stop.customerName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Contact</dt>
          <dd className="text-right text-text">{stop.customerContact}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Address</dt>
          <dd className="text-right text-text">
            {stop.collectionAddress}, {stop.collectionPostcode}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Destination</dt>
          <dd className="text-right text-text">{stop.destinationCountry}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Size</dt>
          <dd className="text-right text-text">{stop.parcelSizeTier.replaceAll("_", " ")}</dd>
        </div>
        {stop.specialInstructions && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Notes</dt>
            <dd className="text-right text-text">{stop.specialInstructions}</dd>
          </div>
        )}
      </dl>

      {stop.status === "PENDING" && (
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
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

          {actionError && <Alert tone="error">{actionError}</Alert>}

          {!showFailForm ? (
            <div className="flex gap-3">
              <Button size="md" loading={collecting} onClick={handleCollect}>
                Mark collected
              </Button>
              <Button variant="danger" size="md" onClick={() => setShowFailForm(true)} disabled={collecting}>
                Unable to collect
              </Button>
            </div>
          ) : (
            <form onSubmit={handleFail} className="flex flex-col gap-3">
              <Textarea
                value={failureReason}
                onChange={e => setFailureReason(e.target.value)}
                placeholder="e.g. No answer at the door"
              />
              <div className="flex gap-3">
                <Button type="submit" variant="danger" size="md" loading={failing} disabled={!failureReason.trim()}>
                  Confirm
                </Button>
                <Button type="button" variant="ghost" size="md" onClick={() => setShowFailForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}

export default function DriverRouteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<CollectUkDriverRouteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setRoute(await collectUkDriverPortal.getRoute(id));
      } catch (err) {
        setError(err instanceof FulfilmentApiError ? err.message : "Could not load this route right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleResolved = (stopId: string, status: string) => {
    setRoute(prev => (prev ? { ...prev, stops: prev.stops.map(s => (s.id === stopId ? { ...s, status: status as CollectUkDriverStop["status"] } : s)) } : prev));
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3">
          <span className="text-lg font-semibold text-primary">Faira Collect — Driver</span>
          <Link href="/collect-uk/driver" className="text-sm font-medium text-muted hover:text-text">
            All routes
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        {loading && (
          <Card className="flex flex-col gap-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
          </Card>
        )}

        {!loading && error && <Alert tone="error">{error}</Alert>}

        {!loading && route && (
          <>
            <h1 className="text-xl font-semibold text-text">
              {new Date(route.routeDate).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </h1>

            {route.stops.length === 0 && (
              <Card className="mt-4">
                <p className="text-sm text-muted">No stops on this route yet.</p>
              </Card>
            )}

            <div className="mt-4 flex flex-col gap-4">
              {route.stops.map(stop => (
                <StopCard key={stop.id} stop={stop} onResolved={handleResolved} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
