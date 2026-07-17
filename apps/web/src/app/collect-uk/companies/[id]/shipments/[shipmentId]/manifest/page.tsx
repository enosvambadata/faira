"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useCompanyPortal } from "@/lib/companyContext";
import {
  collectUkShipments,
  CollectUkShipmentDetail,
  CollectUkShipmentParcel,
  CollectUkManifestSummary,
  FulfilmentApiError,
} from "@/lib/api";

const money = (pence: number | null) => (pence == null ? "—" : `£${(pence / 100).toFixed(2)}`);

function recompute(parcels: CollectUkShipmentParcel[], finalizedAt: string | null): CollectUkManifestSummary {
  return {
    finalizedAt,
    parcelCount: parcels.length,
    loadedCount: parcels.reduce((s, p) => s + (p.loadedAt ? 1 : 0), 0),
    totalPieces: parcels.reduce((s, p) => s + p.pieces, 0),
    totalWeightKg: parcels.reduce((s, p) => s + (p.weightKg ?? 0), 0),
    totalDeclaredValuePence: parcels.reduce((s, p) => s + (p.declaredValuePence ?? 0), 0),
  };
}

function downloadCsv(shipment: CollectUkShipmentDetail) {
  const head = ["#", "Sender", "Receiver", "Receiver phone", "Address", "City", "Contents", "Category", "Pieces", "Weight (kg)", "Declared value (GBP)"];
  const rows = shipment.parcels.map((p, i) => [
    i + 1, p.senderName, p.receiverName, p.receiverContact ?? "", p.receiverAddress ?? "", p.receiverCity ?? "",
    p.description, p.category ?? "", p.pieces, p.weightKg ?? "", p.declaredValuePence != null ? (p.declaredValuePence / 100).toFixed(2) : "",
  ]);
  const csv = [head, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `manifest-${shipment.reference.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ShipmentManifestPage() {
  const { company } = useCompanyPortal();
  const { shipmentId } = useParams<{ shipmentId: string }>();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shipment, setShipment] = useState<CollectUkShipmentDetail | null>(null);

  // Add-parcel form
  const [senderMode, setSenderMode] = useState<"recipient" | "manual">("manual");
  const [senderRecipientId, setSenderRecipientId] = useState<string | undefined>(undefined);
  const [senderName, setSenderName] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverContact, setReceiverContact] = useState("");
  const [receiverAddress, setReceiverAddress] = useState("");
  const [receiverCity, setReceiverCity] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [pieces, setPieces] = useState("1");
  const [weightKg, setWeightKg] = useState("");
  const [declaredValue, setDeclaredValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const detail = await collectUkShipments.get(company.id, shipmentId);
        setShipment(detail);
        setSenderMode(detail.recipients.length > 0 ? "recipient" : "manual");
      } catch (err) {
        setError(err instanceof FulfilmentApiError ? err.message : "Could not load this manifest right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, [company.id, shipmentId]);

  const finalized = Boolean(shipment?.manifestFinalizedAt);

  const resetForm = () => {
    setSenderRecipientId(undefined);
    setSenderName("");
    setReceiverName("");
    setReceiverContact("");
    setReceiverAddress("");
    setReceiverCity("");
    setDescription("");
    setCategory("");
    setPieces("1");
    setWeightKg("");
    setDeclaredValue("");
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!shipment) return;
    setAdding(true);
    setAddError(null);
    try {
      const parcel = await collectUkShipments.addParcel(company.id, shipmentId, {
        recipientId: senderMode === "recipient" ? senderRecipientId : undefined,
        senderName: senderMode === "manual" ? senderName.trim() : undefined,
        receiverName: receiverName.trim(),
        receiverContact: receiverContact.trim() || undefined,
        receiverAddress: receiverAddress.trim() || undefined,
        receiverCity: receiverCity.trim() || undefined,
        description: description.trim(),
        category: category.trim() || undefined,
        pieces: Number(pieces) || 1,
        weightKg: weightKg ? Number(weightKg) : undefined,
        declaredValuePence: declaredValue ? Math.round(Number(declaredValue) * 100) : undefined,
      });
      setShipment(prev => {
        if (!prev) return prev;
        const parcels = [...prev.parcels, parcel];
        return { ...prev, parcels, manifest: recompute(parcels, prev.manifestFinalizedAt) };
      });
      resetForm();
      toast({ title: "Parcel added to manifest", tone: "success" });
    } catch (err) {
      setAddError(err instanceof FulfilmentApiError ? err.message : "Could not add this parcel.");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (parcel: CollectUkShipmentParcel) => {
    try {
      await collectUkShipments.removeParcel(company.id, shipmentId, parcel.id);
      setShipment(prev => {
        if (!prev) return prev;
        const parcels = prev.parcels.filter(p => p.id !== parcel.id);
        return { ...prev, parcels, manifest: recompute(parcels, prev.manifestFinalizedAt) };
      });
    } catch (err) {
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not remove parcel", tone: "error" });
    }
  };

  const handleToggleLoad = async (parcel: CollectUkShipmentParcel) => {
    try {
      const updated = parcel.loadedAt
        ? await collectUkShipments.unloadParcel(company.id, shipmentId, parcel.id)
        : await collectUkShipments.loadParcel(company.id, shipmentId, parcel.id);
      setShipment(prev => {
        if (!prev) return prev;
        const parcels = prev.parcels.map(p => (p.id === parcel.id ? { ...p, loadedAt: updated.loadedAt } : p));
        return { ...prev, parcels, manifest: recompute(parcels, prev.manifestFinalizedAt) };
      });
    } catch (err) {
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not update load status", tone: "error" });
    }
  };

  const handleFinalize = async () => {
    if (!shipment) return;
    if (!window.confirm("Finalize this manifest? Parcels can't be changed afterwards.")) return;
    setFinalizing(true);
    try {
      const res = await collectUkShipments.finalizeManifest(company.id, shipmentId);
      setShipment(prev =>
        prev ? { ...prev, manifestFinalizedAt: res.finalizedAt, manifest: { ...prev.manifest, finalizedAt: res.finalizedAt } } : prev,
      );
      toast({ title: "Manifest finalized", tone: "success" });
    } catch (err) {
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not finalize manifest", tone: "error" });
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) {
    return (
      <Card className="flex flex-col gap-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
      </Card>
    );
  }
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!shipment) return null;

  const canAdd =
    receiverName.trim().length > 0 &&
    description.trim().length > 0 &&
    (senderMode === "recipient" ? Boolean(senderRecipientId) : senderName.trim().length > 0);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/collect-uk/companies/${company.id}/shipments/${shipmentId}`}
        className="text-sm font-medium text-muted hover:text-primary print:hidden"
      >
        ← Back to shipment
      </Link>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button type="button" variant="secondary" size="md" onClick={() => window.print()}>
          Print manifest
        </Button>
        <Button type="button" variant="secondary" size="md" onClick={() => downloadCsv(shipment)}>
          Download CSV
        </Button>
        <Link href={`/collect-uk/companies/${company.id}/shipments/${shipmentId}/labels`}>
          <Button type="button" variant="secondary" size="md" disabled={shipment.parcels.length === 0}>
            Shipping labels
          </Button>
        </Link>
        <Link href={`/collect-uk/companies/${company.id}/shipments/${shipmentId}/load`}>
          <Button type="button" variant="secondary" size="md" disabled={shipment.parcels.length === 0}>
            Load parcels
          </Button>
        </Link>
        {!finalized && (
          <Button type="button" size="md" loading={finalizing} disabled={shipment.parcels.length === 0} onClick={handleFinalize}>
            Finalize manifest
          </Button>
        )}
      </div>

      {/* The manifest document */}
      <Card className="print:border-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Cargo manifest</p>
            <h1 className="mt-1 text-xl font-semibold text-text">{company.name}</h1>
            <p className="mt-0.5 text-sm text-muted">
              {shipment.reference}
              {shipment.destinationCountry ? ` · to ${shipment.destinationCountry}` : ""}
            </p>
          </div>
          <div className="text-right text-sm text-muted">
            {finalized ? (
              <span className="font-medium text-green">Finalized {new Date(shipment.manifestFinalizedAt!).toLocaleDateString()}</span>
            ) : (
              <span>Draft</span>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <span><span className="text-muted">Parcels:</span> <b className="text-text">{shipment.manifest.parcelCount}</b></span>
          {shipment.parcels.length > 0 && (
            <span>
              <span className="text-muted">Loaded:</span>{" "}
              <b className={shipment.manifest.loadedCount === shipment.manifest.parcelCount ? "text-green" : "text-warning"}>
                {shipment.manifest.loadedCount} / {shipment.manifest.parcelCount}
              </b>
            </span>
          )}
          <span><span className="text-muted">Pieces:</span> <b className="text-text">{shipment.manifest.totalPieces}</b></span>
          <span><span className="text-muted">Weight:</span> <b className="text-text">{shipment.manifest.totalWeightKg} kg</b></span>
          <span><span className="text-muted">Declared value:</span> <b className="text-text">{money(shipment.manifest.totalDeclaredValuePence)}</b></span>
        </div>

        {shipment.parcels.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No parcels on the manifest yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-2 font-medium">#</th>
                  <th className="py-2 pr-2 font-medium">Sender</th>
                  <th className="py-2 pr-2 font-medium">Receiver</th>
                  <th className="py-2 pr-2 font-medium">Contents</th>
                  <th className="py-2 pr-2 text-right font-medium">Pcs</th>
                  <th className="py-2 pr-2 text-right font-medium">Kg</th>
                  <th className="py-2 pr-2 text-right font-medium">Value</th>
                  <th className="py-2 font-medium print:hidden"></th>
                </tr>
              </thead>
              <tbody>
                {shipment.parcels.map((p, i) => (
                  <tr key={p.id} className="border-b border-border align-top">
                    <td className="py-2 pr-2 tabular-nums">
                      <span className={p.loadedAt ? "font-medium text-green" : "text-muted"}>
                        {i + 1}
                        {p.loadedAt ? " ●" : ""}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-text">{p.senderName}</td>
                    <td className="py-2 pr-2 text-text">
                      {p.receiverName}
                      {(p.receiverAddress || p.receiverCity || p.receiverContact) && (
                        <span className="block text-xs text-muted">
                          {[p.receiverAddress, p.receiverCity].filter(Boolean).join(", ")}
                          {p.receiverContact ? ` · ${p.receiverContact}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-text">
                      {p.description}
                      {p.category ? <span className="block text-xs text-muted">{p.category}</span> : null}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{p.pieces}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{p.weightKg ?? "—"}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{money(p.declaredValuePence)}</td>
                    <td className="py-2 text-right print:hidden">
                      <div className="flex flex-col items-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleToggleLoad(p)}
                          className={`text-xs font-medium hover:underline ${p.loadedAt ? "text-green" : "text-primary"}`}
                        >
                          {p.loadedAt ? "Loaded ✓" : "Load"}
                        </button>
                        {!finalized && (
                          <button type="button" onClick={() => handleRemove(p)} className="text-xs font-medium text-red hover:underline">
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add-parcel form */}
      {finalized ? (
        <Alert tone="info">This manifest is finalized — parcels are locked. Use Print or Download CSV for the carrier and customs.</Alert>
      ) : (
        <Card className="print:hidden">
          <h2 className="text-base font-semibold text-text">Add a parcel</h2>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setSenderMode("recipient")}
              disabled={shipment.recipients.length === 0}
              className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${senderMode === "recipient" ? "bg-primary-light text-primary" : "text-muted"}`}
            >
              Sender from recipient
            </button>
            <button
              type="button"
              onClick={() => setSenderMode("manual")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${senderMode === "manual" ? "bg-primary-light text-primary" : "text-muted"}`}
            >
              Type sender
            </button>
          </div>

          <form onSubmit={handleAdd} className="mt-3 flex flex-col gap-4">
            {senderMode === "recipient" ? (
              <Field label="Sender (recipient on this shipment)" required>
                {p => (
                  <Select
                    {...p}
                    value={senderRecipientId}
                    onValueChange={setSenderRecipientId}
                    placeholder="Choose a recipient"
                    options={shipment.recipients.map(r => ({ value: r.id, label: `${r.customerName} · ${r.customerContact}` }))}
                  />
                )}
              </Field>
            ) : (
              <Field label="Sender name" required>
                {p => <Input {...p} value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="UK sender" />}
              </Field>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Receiver name" required>
                {p => <Input {...p} value={receiverName} onChange={e => setReceiverName(e.target.value)} placeholder="Consignee at destination" />}
              </Field>
              <Field label="Receiver phone" hint="Optional">
                {p => <Input {...p} value={receiverContact} onChange={e => setReceiverContact(e.target.value)} placeholder="Destination number" />}
              </Field>
              <Field label="Receiver address" hint="Optional">
                {p => <Input {...p} value={receiverAddress} onChange={e => setReceiverAddress(e.target.value)} />}
              </Field>
              <Field label="Receiver city" hint="Optional">
                {p => <Input {...p} value={receiverCity} onChange={e => setReceiverCity(e.target.value)} />}
              </Field>
            </div>

            <Field label="Contents" required>
              {p => <Input {...p} value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. 2 drums clothing & food" />}
            </Field>

            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Category" hint="Optional">
                {p => <Input {...p} value={category} onChange={e => setCategory(e.target.value)} placeholder="Drum" />}
              </Field>
              <Field label="Pieces">
                {p => <Input {...p} type="number" min="1" value={pieces} onChange={e => setPieces(e.target.value)} />}
              </Field>
              <Field label="Weight (kg)" hint="Optional">
                {p => <Input {...p} type="number" min="0" step="0.1" value={weightKg} onChange={e => setWeightKg(e.target.value)} />}
              </Field>
              <Field label="Declared value (£)" hint="Optional">
                {p => <Input {...p} type="number" min="0" step="0.01" value={declaredValue} onChange={e => setDeclaredValue(e.target.value)} />}
              </Field>
            </div>

            {addError && <Alert tone="error">{addError}</Alert>}
            <Button type="submit" size="md" variant="secondary" loading={adding} disabled={!canAdd}>
              Add parcel
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
