"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase";
import { manifests as manifestsApi, FulfilmentApiError } from "@/lib/api";

interface ScannedParcel {
  reference: string;
  status: string;
}

export default function HubOpsArrivalPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [reference, setReference] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<ScannedParcel | null>(null);

  const handleSignOut = async () => {
    await createClient().auth.signOut();
    router.push("/login");
  };

  const handleScanIn = async (e: FormEvent) => {
    e.preventDefault();
    if (!reference.trim()) return;

    setScanning(true);
    setScanError(null);
    try {
      const result = await manifestsApi.scanIn(reference.trim());
      setLastScanned({ reference: result.reference, status: result.status });
      setReference("");
      toast({ title: `${result.reference} scanned in — buyer notified`, tone: "success" });
    } catch (err) {
      setScanError(err instanceof FulfilmentApiError ? err.message : "Could not scan this parcel in right now.");
    } finally {
      setScanning(false);
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
            <Link href="/hub-ops/inspect" className="text-sm font-medium text-muted hover:text-text">
              Inspect &amp; seal
            </Link>
            <Link href="/hub-ops/manifest" className="text-sm font-medium text-muted hover:text-text">
              Manifest
            </Link>
            <Link href="/hub-ops/collect" className="text-sm font-medium text-muted hover:text-text">
              Collect
            </Link>
            <Button variant="ghost" size="md" onClick={handleSignOut}>
              Sign out
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="text-xl font-semibold text-text">Scan parcels in on arrival</h1>
        <p className="mt-1 text-sm text-muted">
          Scan each parcel as it arrives at this hub. The buyer is notified with a collection code as soon as it&apos;s scanned in.
        </p>

        <Card className="mt-6">
          <form onSubmit={handleScanIn} className="flex flex-col gap-4">
            <Field label="Shipment reference" required>
              {p => (
                <Input {...p} value={reference} onChange={e => setReference(e.target.value)} placeholder="FF-HRE-000123" autoFocus />
              )}
            </Field>
            {scanError && <Alert tone="error">{scanError}</Alert>}
            <Button type="submit" size="lg" loading={scanning} disabled={!reference.trim()}>
              Scan in
            </Button>
          </form>
        </Card>

        {lastScanned && (
          <Card className="mt-4">
            <Alert tone="success">
              <span className="font-mono font-semibold">{lastScanned.reference}</span> is ready for collection. The buyer has been sent
              a collection code by SMS.
            </Alert>
          </Card>
        )}
      </main>
    </div>
  );
}
