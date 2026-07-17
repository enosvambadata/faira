"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCompanyPortal } from "@/lib/companyContext";
import { collectUkShipments, CollectUkShipmentDetail, CollectUkShipmentParcel, FulfilmentApiError } from "@/lib/api";

type Tone = "success" | "info" | "error";
interface ScanResult {
  id: number;
  tone: Tone;
  title: string;
  subtitle: string;
}

const toneClasses: Record<Tone, string> = {
  success: "border-green/30 bg-green/10 text-green",
  info: "border-warning/30 bg-warning/15 text-dark",
  error: "border-red/20 bg-red/10 text-red",
};

const DEDUPE_MS = 3000;

export default function ShipmentLoadPage() {
  const { company } = useCompanyPortal();
  const { shipmentId } = useParams<{ shipmentId: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shipment, setShipment] = useState<CollectUkShipmentDetail | null>(null);
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [results, setResults] = useState<ScanResult[]>([]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const recentRef = useRef<Map<string, number>>(new Map());
  const idRef = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        setShipment(await collectUkShipments.get(company.id, shipmentId));
      } catch (err) {
        setError(err instanceof FulfilmentApiError ? err.message : "Could not load this shipment right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, [company.id, shipmentId]);

  const pushResult = (r: Omit<ScanResult, "id">) => {
    setResults(prev => [{ ...r, id: ++idRef.current }, ...prev].slice(0, 100));
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(r.tone === "success" ? 60 : [40, 40, 40]);
  };

  const applyLoaded = (parcelId: string, loadedAt: string | null) => {
    setShipment(prev => {
      if (!prev) return prev;
      const parcels = prev.parcels.map(p => (p.id === parcelId ? { ...p, loadedAt } : p));
      const loadedCount = parcels.reduce((s, p) => s + (p.loadedAt ? 1 : 0), 0);
      return { ...prev, parcels, manifest: { ...prev.manifest, loadedCount } };
    });
  };

  const loadById = async (parcelId: string) => {
    try {
      const res = await collectUkShipments.loadParcel(company.id, shipmentId, parcelId);
      applyLoaded(parcelId, res.loadedAt);
      if (res.alreadyLoaded) {
        pushResult({ tone: "info", title: "Already loaded", subtitle: `${res.senderName} → ${res.receiverName}` });
      } else {
        pushResult({ tone: "success", title: `Loaded — ${res.senderName} → ${res.receiverName}`, subtitle: res.description });
      }
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.status === 404) {
        pushResult({ tone: "error", title: "Not on this shipment", subtitle: "That label belongs to a different manifest" });
      } else {
        pushResult({ tone: "error", title: "Couldn't load this parcel", subtitle: parcelId });
      }
    }
  };

  const onScanSuccess = (decodedText: string) => {
    const now = Date.now();
    const last = recentRef.current.get(decodedText);
    if (last && now - last < DEDUPE_MS) return;
    recentRef.current.set(decodedText, now);
    loadById(decodedText);
  };

  const startScanning = async () => {
    setCameraError(null);
    setStarting(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 240, height: 240 } }, onScanSuccess, () => {});
      setScanning(true);
    } catch {
      setCameraError("Couldn't start the camera — check permissions, or tap parcels in the list below to load them.");
    } finally {
      setStarting(false);
    }
  };

  const stopScanning = async () => {
    const s = scannerRef.current;
    if (s) {
      try {
        await s.stop();
        await s.clear();
      } catch {
        /* already stopped */
      }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  useEffect(() => {
    return () => {
      const s = scannerRef.current;
      if (s) s.stop().catch(() => {});
    };
  }, []);

  const handleTapToggle = async (parcel: CollectUkShipmentParcel) => {
    try {
      const updated = parcel.loadedAt
        ? await collectUkShipments.unloadParcel(company.id, shipmentId, parcel.id)
        : await collectUkShipments.loadParcel(company.id, shipmentId, parcel.id);
      applyLoaded(parcel.id, updated.loadedAt);
    } catch {
      /* ignore, list still reflects server on reload */
    }
  };

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!shipment) return null;

  const loaded = shipment.manifest.loadedCount;
  const total = shipment.manifest.parcelCount;
  const pct = total === 0 ? 0 : Math.round((loaded / total) * 100);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/collect-uk/companies/${company.id}/shipments/${shipmentId}/manifest`}
        className="text-sm font-medium text-muted hover:text-primary"
      >
        ← Back to manifest
      </Link>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-text">Load {shipment.reference}</h2>
            <p className="mt-0.5 text-sm text-muted">Scan each parcel&apos;s shipping label as it goes into the container.</p>
          </div>
          <div className="text-right">
            <div className={`text-lg font-semibold ${loaded === total && total > 0 ? "text-green" : "text-text"}`}>
              {loaded} / {total}
            </div>
            <div className="text-xs text-muted">loaded</div>
          </div>
        </div>

        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-border">
          <div className={`h-full ${loaded === total && total > 0 ? "bg-green" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>

        <div id="qr-reader" className={`mt-4 overflow-hidden rounded-lg ${scanning ? "border border-border" : ""}`} />

        <div className="mt-3 flex flex-wrap gap-2">
          {!scanning ? (
            <Button type="button" size="md" loading={starting} onClick={startScanning}>
              Start scanning
            </Button>
          ) : (
            <Button type="button" size="md" variant="secondary" onClick={stopScanning}>
              Stop camera
            </Button>
          )}
        </div>

        {cameraError && (
          <div className="mt-3">
            <Alert tone="warning">{cameraError}</Alert>
          </div>
        )}
      </Card>

      {results.length > 0 && (
        <Card>
          <h2 className="text-base font-semibold text-text">Recent scans</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {results.map(r => (
              <li key={r.id} className={`rounded-md border p-3 ${toneClasses[r.tone]}`}>
                <div className="text-sm font-medium">{r.title}</div>
                <div className="text-xs opacity-90">{r.subtitle}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="text-base font-semibold text-text">Parcels</h2>
        {shipment.parcels.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No parcels on this manifest.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {shipment.parcels.map((p, i) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text">
                    {i + 1}. {p.senderName} → {p.receiverName}
                  </div>
                  <div className="truncate text-xs text-muted">{p.description}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleTapToggle(p)}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium ${p.loadedAt ? "bg-green/10 text-green" : "bg-primary-light text-primary"}`}
                >
                  {p.loadedAt ? "Loaded ✓" : "Load"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
