"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { useToast } from "@/components/ui/Toast";
import {
  shipments as shipmentsApi,
  ShipmentDetail,
  hubs as hubsApi,
  Hub,
  ShipmentQuote,
  FulfilmentApiError,
} from "@/lib/api";

const FEE_PAYER_OPTIONS = [
  { value: "SELLER", label: "I'll pay", description: "The delivery fee comes out of your payout." },
  { value: "BUYER", label: "Buyer pays", description: "The buyer pays the delivery fee on collection." },
];

export default function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [shipment, setShipment] = useState<ShipmentDetail | null>(null);
  const [hubOptions, setHubOptions] = useState<Hub[]>([]);
  const [abandoning, setAbandoning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<ShipmentQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [feePayer, setFeePayer] = useState<string | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmingShipment, setConfirmingShipment] = useState(false);

  useEffect(() => {
    Promise.all([shipmentsApi.get(id), hubsApi.list()])
      .then(([shipmentResult, hubs]) => {
        setShipment(shipmentResult);
        setHubOptions(hubs);
        if (shipmentResult.status === "DRAFT" && !shipmentResult.feePayer) {
          setQuoteLoading(true);
          shipmentsApi
            .getQuote(id)
            .then(setQuote)
            .catch(() => setQuoteError("Could not load a delivery quote right now."))
            .finally(() => setQuoteLoading(false));
        }
      })
      .catch(() => setError("Could not load this shipment."))
      .finally(() => setLoading(false));
  }, [id]);

  const handleConfirmQuote = async () => {
    if (!feePayer) return;
    setConfirming(true);
    setQuoteError(null);
    try {
      const result = await shipmentsApi.confirmQuote(id, feePayer as "SELLER" | "BUYER");
      setShipment(prev => (prev ? { ...prev, feePayer: result.feePayer, deliveryFee: result.deliveryFee } : prev));
      toast({ title: "Delivery fee confirmed", tone: "success" });
    } catch (err) {
      setQuoteError(err instanceof FulfilmentApiError ? err.message : "Could not confirm the delivery fee right now.");
    } finally {
      setConfirming(false);
    }
  };

  const handleConfirmShipment = async () => {
    setConfirmingShipment(true);
    setConfirmError(null);
    try {
      const result = await shipmentsApi.confirm(id);
      setShipment(prev =>
        prev
          ? {
              ...prev,
              status: result.status,
              dropoffDeadline: result.dropoffDeadline,
              reference: result.reference,
              qrCodeUrl: result.qrCodeUrl,
            }
          : prev,
      );
      toast({ title: "Shipment confirmed", tone: "success" });
    } catch (err) {
      setConfirmError(err instanceof FulfilmentApiError ? err.message : "Could not confirm this shipment right now.");
    } finally {
      setConfirmingShipment(false);
    }
  };

  const hubName = (hubId: string) => hubOptions.find(h => h.id === hubId)?.name ?? hubId;

  const handleAbandon = async () => {
    setAbandoning(true);
    try {
      await shipmentsApi.abandon(id);
      toast({ title: "Draft removed", tone: "success" });
      router.push("/dashboard");
    } catch {
      toast({ title: "Could not remove this draft", tone: "error" });
    } finally {
      setAbandoning(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <Skeleton className="h-72 w-full max-w-xl" />
      </AppShell>
    );
  }

  if (error || !shipment) {
    return (
      <AppShell>
        <Alert tone="error">{error ?? "Shipment not found."}</Alert>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-xl">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-text">Shipment</h1>
          <StatusBadge label={shipment.status.replaceAll("_", " ")} tone={shipment.status === "DRAFT" ? "neutral" : "info"} />
        </div>

        <Card className="mt-6">
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Buyer</dt>
              <dd className="text-right text-text">{shipment.buyerName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Buyer contact</dt>
              <dd className="text-right text-text">{shipment.buyerContact}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Route</dt>
              <dd className="text-right text-text">
                {hubName(shipment.originHubId)} → {hubName(shipment.destinationHubId)}
              </dd>
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
        </Card>

        {shipment.status === "DRAFT" && shipment.feePayer && (
          <Card className="mt-4">
            <h2 className="text-base font-semibold text-text">Delivery fee</h2>
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-muted">Fee</span>
              <span className="text-text">${shipment.deliveryFee}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-muted">Paid by</span>
              <span className="text-text">{shipment.feePayer === "SELLER" ? "You" : "Buyer"}</span>
            </div>

            {confirmError && (
              <div className="mt-3">
                <Alert tone="error">{confirmError}</Alert>
              </div>
            )}

            <Button className="mt-4" size="lg" onClick={handleConfirmShipment} loading={confirmingShipment}>
              Confirm shipment
            </Button>
          </Card>
        )}

        {shipment.status !== "DRAFT" && (
          <Card className="mt-4">
            <h2 className="text-base font-semibold text-text">Shipment confirmed</h2>
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-muted">Delivery fee</span>
              <span className="text-text">
                ${shipment.deliveryFee} ({shipment.feePayer === "SELLER" ? "you" : "buyer"} pays)
              </span>
            </div>
            {shipment.dropoffDeadline && (
              <div className="mt-1 flex justify-between text-sm">
                <span className="text-muted">Drop off by</span>
                <span className="text-text">{new Date(shipment.dropoffDeadline).toLocaleString()}</span>
              </div>
            )}

            {shipment.reference && (
              <div className="mt-4 flex flex-col items-center gap-3 border-t border-border pt-4">
                <p className="text-sm text-muted">Print this and attach it to the parcel</p>
                {shipment.qrCodeUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- a data: URL, not an optimizable remote image
                  <img src={shipment.qrCodeUrl} alt={`QR code for shipment ${shipment.reference}`} className="h-40 w-40" />
                )}
                <p className="font-mono text-lg font-semibold tracking-wide text-text">{shipment.reference}</p>
              </div>
            )}

            {shipment.status === "AWAITING_PAYMENT" && (
              <p className="mt-3 text-sm text-muted">
                Delivery fee payment isn&apos;t available yet — this is coming soon.
              </p>
            )}
          </Card>
        )}

        {shipment.status === "DRAFT" && !shipment.feePayer && (
          <Card className="mt-4">
            <h2 className="text-base font-semibold text-text">Delivery fee</h2>
            {quoteLoading ? (
              <Skeleton className="mt-3 h-20 w-full" />
            ) : quote ? (
              <>
                <p className="mt-2 text-2xl font-semibold text-text">${quote.fee.toFixed(2)}</p>
                <p className="text-sm text-muted">
                  {quote.source === "pricing_rule"
                    ? "Based on your selected route and parcel size."
                    : "Estimated — this route doesn't have a custom rate yet."}
                </p>

                <div className="mt-4">
                  <p className="mb-2 text-sm font-medium text-text">Who pays the delivery fee?</p>
                  <RadioGroup value={feePayer} onValueChange={setFeePayer} options={FEE_PAYER_OPTIONS} name="feePayer" />
                </div>

                {quoteError && (
                  <div className="mt-3">
                    <Alert tone="error">{quoteError}</Alert>
                  </div>
                )}

                <Button className="mt-4" size="lg" onClick={handleConfirmQuote} loading={confirming} disabled={!feePayer}>
                  Confirm delivery fee
                </Button>
              </>
            ) : (
              <div className="mt-3">
                <Alert tone="error">{quoteError ?? "Could not load a delivery quote."}</Alert>
              </div>
            )}
          </Card>
        )}

        {shipment.status === "DRAFT" && (
          <Card className="mt-4">
            <Button variant="danger" size="md" onClick={handleAbandon} loading={abandoning}>
              Remove this draft
            </Button>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
