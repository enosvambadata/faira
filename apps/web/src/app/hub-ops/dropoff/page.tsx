"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase";
import { hubOps as hubOpsApi, HubOpsShipment, FulfilmentApiError } from "@/lib/api";

export default function HubOpsDropoffPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [reference, setReference] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [shipment, setShipment] = useState<HubOpsShipment | null>(null);

  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

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
    setShowRejectForm(false);
    setActionError(null);
    try {
      const result = await hubOpsApi.search(reference.trim());
      setShipment(result);
    } catch (err) {
      setSearchError(err instanceof FulfilmentApiError ? err.message : "Could not look up that reference right now.");
    } finally {
      setSearching(false);
    }
  };

  const resetAfterAction = () => {
    setShipment(null);
    setReference("");
    setShowRejectForm(false);
    setRejectReason("");
  };

  const handleAccept = async () => {
    if (!shipment) return;
    setAccepting(true);
    setActionError(null);
    try {
      await hubOpsApi.acceptDropoff(shipment.id);
      toast({ title: `${shipment.reference ?? "Shipment"} accepted`, tone: "success" });
      resetAfterAction();
    } catch (err) {
      setActionError(err instanceof FulfilmentApiError ? err.message : "Could not accept this drop-off right now.");
    } finally {
      setAccepting(false);
    }
  };

  const handleReject = async (e: FormEvent) => {
    e.preventDefault();
    if (!shipment || !rejectReason.trim()) return;
    setRejecting(true);
    setActionError(null);
    try {
      await hubOpsApi.rejectDropoff(shipment.id, rejectReason.trim());
      toast({ title: `${shipment.reference ?? "Shipment"} rejected`, tone: "success" });
      resetAfterAction();
    } catch (err) {
      setActionError(err instanceof FulfilmentApiError ? err.message : "Could not reject this drop-off right now.");
    } finally {
      setRejecting(false);
    }
  };

  const canAction = shipment && (shipment.status === "AWAITING_DROPOFF" || shipment.status === "DROPOFF_OVERDUE");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3">
          <span className="text-lg font-semibold text-primary">Faira Fulfilment — Hub Ops</span>
          <nav className="flex items-center gap-4">
            <Link href="/hub-ops/inspect" className="text-sm font-medium text-muted hover:text-text">
              Inspect &amp; seal
            </Link>
            <Link href="/hub-ops/manifest" className="text-sm font-medium text-muted hover:text-text">
              Manifest
            </Link>
            <Link href="/hub-ops/arrival" className="text-sm font-medium text-muted hover:text-text">
              Arrival scan
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
        <h1 className="text-xl font-semibold text-text">Accept a drop-off</h1>
        <p className="mt-1 text-sm text-muted">Search by the shipment reference on the seller&apos;s parcel label or QR code.</p>

        <Card className="mt-6">
          <form onSubmit={handleSearch} className="flex flex-col gap-4">
            <Field label="Shipment reference" required>
              {p => (
                <Input
                  {...p}
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  placeholder="FF-HRE-000123"
                  autoFocus
                />
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
              <StatusBadge label={shipment.displayStatus} tone={canAction ? "info" : "neutral"} />
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
                <dt className="text-muted">Category</dt>
                <dd className="text-right text-text">{shipment.category}</dd>
              </div>
              {shipment.description && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Description</dt>
                  <dd className="text-right text-text">{shipment.description}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Declared value</dt>
                <dd className="text-right text-text">${shipment.declaredValue}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Size</dt>
                <dd className="text-right text-text">{shipment.sizeTier.replaceAll("_", " ")}</dd>
              </div>
            </dl>

            {!canAction && (
              <div className="mt-4">
                <Alert tone="warning">This shipment isn&apos;t awaiting drop-off, so it can&apos;t be accepted or rejected here.</Alert>
              </div>
            )}

            {actionError && (
              <div className="mt-4">
                <Alert tone="error">{actionError}</Alert>
              </div>
            )}

            {canAction && !showRejectForm && (
              <div className="mt-4 flex gap-3">
                <Button size="lg" onClick={handleAccept} loading={accepting}>
                  Accept drop-off
                </Button>
                <Button variant="danger" size="lg" onClick={() => setShowRejectForm(true)} disabled={accepting}>
                  Reject
                </Button>
              </div>
            )}

            {canAction && showRejectForm && (
              <form onSubmit={handleReject} className="mt-4 flex flex-col gap-3">
                <Field label="Reason for rejection" required>
                  {p => (
                    <Textarea
                      {...p}
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder="e.g. Parcel arrived already damaged"
                    />
                  )}
                </Field>
                <div className="flex gap-3">
                  <Button type="submit" variant="danger" size="lg" loading={rejecting} disabled={!rejectReason.trim()}>
                    Confirm rejection
                  </Button>
                  <Button type="button" variant="ghost" size="lg" onClick={() => setShowRejectForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}
