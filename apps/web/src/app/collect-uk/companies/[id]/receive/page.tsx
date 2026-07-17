"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useCompanyPortal } from "@/lib/companyContext";
import { collectUkCompanies, FulfilmentApiError } from "@/lib/api";

type Tone = "success" | "info" | "error";
interface ScanResult {
  id: number;
  reference: string;
  tone: Tone;
  title: string;
  subtitle: string;
}

const toneClasses: Record<Tone, string> = {
  success: "border-green/30 bg-green/10 text-green",
  info: "border-warning/30 bg-warning/15 text-dark",
  error: "border-red/20 bg-red/10 text-red",
};

// html5-qrcode fires the success callback many times a second while a code is
// in frame; only act on a given reference once every few seconds.
const DEDUPE_MS = 3000;

export default function CompanyReceivePage() {
  const { company } = useCompanyPortal();

  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [manualRef, setManualRef] = useState("");
  const [processing, setProcessing] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const recentRef = useRef<Map<string, number>>(new Map());
  const idRef = useRef(0);

  const pushResult = (r: Omit<ScanResult, "id">) => {
    setResults(prev => [{ ...r, id: ++idRef.current }, ...prev].slice(0, 100));
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(r.tone === "success" ? 60 : [40, 40, 40]);
  };

  const processReference = async (reference: string) => {
    const ref = reference.trim();
    if (!ref) return;
    setProcessing(true);
    try {
      const res = await collectUkCompanies.receiveByReference(company.id, ref);
      pushResult({
        reference: ref,
        tone: "success",
        title: `Received — ${res.customerName}`,
        subtitle: `${res.reference ?? ref} · ${res.numberOfParcels} pc${res.numberOfParcels === 1 ? "" : "s"} → ${res.destinationCountry}`,
      });
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.code === "ALREADY_RECEIVED") {
        pushResult({ reference: ref, tone: "info", title: "Already received", subtitle: ref });
      } else if (err instanceof FulfilmentApiError && err.code === "NOT_ARRIVED") {
        pushResult({ reference: ref, tone: "error", title: "Not arrived yet", subtitle: `${ref} — the driver hasn't dropped this yet` });
      } else if (err instanceof FulfilmentApiError && err.status === 404) {
        pushResult({ reference: ref, tone: "error", title: "Unknown code", subtitle: `${ref} — not one of your parcels` });
      } else {
        pushResult({ reference: ref, tone: "error", title: "Couldn't receive this parcel", subtitle: ref });
      }
    } finally {
      setProcessing(false);
    }
  };

  const onScanSuccess = (decodedText: string) => {
    const now = Date.now();
    const last = recentRef.current.get(decodedText);
    if (last && now - last < DEDUPE_MS) return;
    recentRef.current.set(decodedText, now);
    processReference(decodedText);
  };

  const startScanning = async () => {
    setCameraError(null);
    setStarting(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        onScanSuccess,
        () => {},
      );
      setScanning(true);
    } catch {
      setCameraError("Couldn't start the camera — check camera permissions, or type the reference below.");
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

  // Stop the camera when leaving the page.
  useEffect(() => {
    return () => {
      const s = scannerRef.current;
      if (s) s.stop().catch(() => {});
    };
  }, []);

  const handleManual = async (e: FormEvent) => {
    e.preventDefault();
    if (!manualRef.trim()) return;
    await processReference(manualRef);
    setManualRef("");
  };

  const receivedCount = results.filter(r => r.tone === "success").length;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="text-base font-semibold text-text">Receive parcels</h2>
        <p className="mt-1 text-sm text-muted">
          Scan each parcel&apos;s label QR as it comes off the van to confirm you&apos;ve received it. Confirming receipt
          accepts the collection (and its charge), and texts the customer their goods have arrived.
        </p>

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

        <form onSubmit={handleManual} className="mt-4 flex items-end gap-2 border-t border-border pt-4">
          <div className="flex-1">
            <Field label="Or type a reference">
              {p => <Input {...p} value={manualRef} onChange={e => setManualRef(e.target.value)} placeholder="e.g. FC-abc-000123" />}
            </Field>
          </div>
          <Button type="submit" size="md" variant="secondary" loading={processing} disabled={!manualRef.trim()}>
            Receive
          </Button>
        </form>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text">
            This session{receivedCount > 0 ? ` · ${receivedCount} received` : ""}
          </h2>
          {results.length > 0 && (
            <button type="button" onClick={() => setResults([])} className="text-sm font-medium text-muted hover:text-primary">
              Clear
            </button>
          )}
        </div>
        {results.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing scanned yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {results.map(r => (
              <li key={r.id} className={`rounded-md border p-3 ${toneClasses[r.tone]}`}>
                <div className="text-sm font-medium">{r.title}</div>
                <div className="text-xs opacity-90">{r.subtitle}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
