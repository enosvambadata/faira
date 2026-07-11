"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { shipments as shipmentsApi, ShipmentDetail, hubs as hubsApi, Hub } from "@/lib/api";

export default function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [shipment, setShipment] = useState<ShipmentDetail | null>(null);
  const [hubOptions, setHubOptions] = useState<Hub[]>([]);
  const [abandoning, setAbandoning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([shipmentsApi.get(id), hubsApi.list()])
      .then(([shipmentResult, hubs]) => {
        setShipment(shipmentResult);
        setHubOptions(hubs);
      })
      .catch(() => setError("Could not load this shipment."))
      .finally(() => setLoading(false));
  }, [id]);

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

        {shipment.status === "DRAFT" && (
          <Card className="mt-4 bg-primary-light">
            <p className="text-sm text-primary-dark">
              Delivery quote and drop-off details are coming soon. For now, this draft is saved — you can come back to
              it from your dashboard.
            </p>
            <Button variant="danger" size="md" className="mt-3" onClick={handleAbandon} loading={abandoning}>
              Remove this draft
            </Button>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
