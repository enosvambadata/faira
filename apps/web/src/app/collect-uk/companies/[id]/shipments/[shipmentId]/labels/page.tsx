"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCompanyPortal } from "@/lib/companyContext";
import { PaperModeToggle, ThermalLabelStyle, PaperMode } from "@/components/collect-uk/LabelPrint";
import { collectUkShipments, CollectUkShipmentDetail, FulfilmentApiError } from "@/lib/api";

const money = (pence: number | null) => (pence == null ? null : `£${(pence / 100).toFixed(2)}`);

// Outbound shipping labels — one per manifest parcel, stuck on the box at
// consolidation. The QR encodes the parcel id; scanning it on the Load page
// marks the parcel loaded. Plain print CSS, no PDF dependency.
export default function ShipmentLabelsPage() {
  const { company } = useCompanyPortal();
  const { shipmentId } = useParams<{ shipmentId: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shipment, setShipment] = useState<CollectUkShipmentDetail | null>(null);
  const [paper, setPaper] = useState<PaperMode>("a4");

  useEffect(() => {
    (async () => {
      try {
        setShipment(await collectUkShipments.get(company.id, shipmentId));
      } catch (err) {
        setError(err instanceof FulfilmentApiError ? err.message : "Could not load labels right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, [company.id, shipmentId]);

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!shipment) return null;

  return (
    <div className="flex flex-col gap-4">
      <style>{`@media print { .no-print { display: none !important; } .label-card { break-inside: avoid; } }`}</style>
      <ThermalLabelStyle active={paper === "label"} />

      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <Link
          href={`/collect-uk/companies/${company.id}/shipments/${shipmentId}/manifest`}
          className="text-sm font-medium text-muted hover:text-primary"
        >
          ← Back to manifest
        </Link>
        {shipment.parcels.length > 0 && (
          <div className="flex items-center gap-3">
            <PaperModeToggle mode={paper} onChange={setPaper} />
            <Button type="button" size="md" onClick={() => window.print()}>
              Print {shipment.parcels.length} label{shipment.parcels.length === 1 ? "" : "s"}
            </Button>
          </div>
        )}
      </div>

      {shipment.parcels.length === 0 ? (
        <p className="text-sm text-muted no-print">No parcels on this manifest yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {shipment.parcels.map((p, i) => (
            <div key={p.id} className="label-card rounded-lg border-2 border-dark p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Shipment</p>
                  <p className="text-lg font-bold text-dark">{shipment.reference}</p>
                  {shipment.destinationCountry && <p className="text-sm font-semibold text-dark">to {shipment.destinationCountry}</p>}
                </div>
                <div className="text-center">
                  <QRCodeSVG value={p.id} size={92} marginSize={0} title={`Scan to load parcel ${i + 1}`} />
                  <p className="mt-1 text-xs font-bold text-dark">Parcel {i + 1} of {shipment.parcels.length}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">From</p>
                  <p className="font-semibold text-dark">{p.senderName}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">To</p>
                  <p className="font-semibold text-dark">{p.receiverName}</p>
                  {(p.receiverAddress || p.receiverCity) && (
                    <p className="text-dark">{[p.receiverAddress, p.receiverCity].filter(Boolean).join(", ")}</p>
                  )}
                  {p.receiverContact && <p className="text-dark">{p.receiverContact}</p>}
                </div>
                <div className="col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Contents</p>
                  <p className="font-semibold text-dark">
                    {p.description}
                    {p.category ? ` · ${p.category}` : ""}
                    {" · "}
                    {p.pieces} pc{p.pieces === 1 ? "" : "s"}
                    {p.weightKg != null ? ` · ${p.weightKg} kg` : ""}
                    {money(p.declaredValuePence) ? ` · ${money(p.declaredValuePence)}` : ""}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
