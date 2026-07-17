"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useCompanyPortal } from "@/lib/companyContext";
import { ShipmentStatusBadge, SHIPMENT_STATUS_OPTIONS } from "@/components/collect-uk/ShipmentStatusBadge";
import {
  collectUkShipments,
  collectUkCompanies,
  CollectUkShipmentDetail,
  CollectUkShipmentMilestone,
  CollectUkShipmentRecipient,
  CollectUkShipmentStatus,
  CollectUkBookingSummary,
  FulfilmentApiError,
} from "@/lib/api";

// Common transit stages as one-tap presets; the owner can still type a
// custom stage for any corridor. Ordered as a typical UK->Africa sea journey.
const PRESETS = ["At UK port", "Vessel sailed", "Arrived at port", "At border", "At our storage"];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function ShipmentDetailPage() {
  const { company } = useCompanyPortal();
  const { shipmentId } = useParams<{ shipmentId: string }>();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shipment, setShipment] = useState<CollectUkShipmentDetail | null>(null);
  const [bookings, setBookings] = useState<CollectUkBookingSummary[]>([]);

  // Post-milestone form
  const [stage, setStage] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [showPickup, setShowPickup] = useState(false);
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupFrom, setPickupFrom] = useState("");
  const [pickupTo, setPickupTo] = useState("");
  const [setStatus, setSetStatus] = useState<string | undefined>(undefined);
  const [notify, setNotify] = useState(true);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  // Add-recipient form
  const [recipMode, setRecipMode] = useState<"booking" | "manual">("booking");
  const [bookingId, setBookingId] = useState<string | undefined>(undefined);
  const [rName, setRName] = useState("");
  const [rContact, setRContact] = useState("");
  const [addingRecip, setAddingRecip] = useState(false);
  const [recipError, setRecipError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [detail, bookingList] = await Promise.all([
          collectUkShipments.get(company.id, shipmentId),
          collectUkCompanies.listBookings(company.id).catch(() => [] as CollectUkBookingSummary[]),
        ]);
        setShipment(detail);
        setBookings(bookingList);
      } catch (err) {
        setError(err instanceof FulfilmentApiError ? err.message : "Could not load this shipment right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, [company.id, shipmentId]);

  const handlePost = async (e: FormEvent) => {
    e.preventDefault();
    if (!stage.trim() || !shipment) return;
    setPosting(true);
    setPostError(null);
    try {
      const milestone = await collectUkShipments.postMilestone(company.id, shipmentId, {
        stage: stage.trim(),
        location: location.trim() || undefined,
        note: note.trim() || undefined,
        pickupAddress: showPickup && pickupAddress.trim() ? pickupAddress.trim() : undefined,
        pickupFrom: showPickup && pickupFrom ? pickupFrom : undefined,
        pickupTo: showPickup && pickupTo ? pickupTo : undefined,
        setStatus: (setStatus as CollectUkShipmentStatus | undefined) || undefined,
        notify,
      });
      setShipment(prev =>
        prev
          ? {
              ...prev,
              status: (setStatus as CollectUkShipmentStatus | undefined) || prev.status,
              milestones: [...prev.milestones, milestone],
            }
          : prev,
      );
      setStage("");
      setLocation("");
      setNote("");
      setPickupAddress("");
      setPickupFrom("");
      setPickupTo("");
      setShowPickup(false);
      setSetStatus(undefined);
      toast({
        title: notify
          ? `Update posted — ${milestone.notifiedCount} customer${milestone.notifiedCount === 1 ? "" : "s"} notified`
          : "Update posted (no SMS sent)",
        tone: "success",
      });
    } catch (err) {
      setPostError(err instanceof FulfilmentApiError ? err.message : "Could not post this update.");
    } finally {
      setPosting(false);
    }
  };

  const handleAddRecipient = async (e: FormEvent) => {
    e.preventDefault();
    setAddingRecip(true);
    setRecipError(null);
    try {
      const payload =
        recipMode === "booking"
          ? { bookingId }
          : { customerName: rName.trim(), customerContact: rContact.trim() };
      const recipient = await collectUkShipments.addRecipient(company.id, shipmentId, payload);
      setShipment(prev => (prev ? { ...prev, recipients: [...prev.recipients, recipient] } : prev));
      setBookingId(undefined);
      setRName("");
      setRContact("");
      toast({ title: "Recipient added", tone: "success" });
    } catch (err) {
      setRecipError(err instanceof FulfilmentApiError ? err.message : "Could not add this recipient.");
    } finally {
      setAddingRecip(false);
    }
  };

  const handleRemoveRecipient = async (recipient: CollectUkShipmentRecipient) => {
    try {
      await collectUkShipments.removeRecipient(company.id, shipmentId, recipient.id);
      setShipment(prev => (prev ? { ...prev, recipients: prev.recipients.filter(r => r.id !== recipient.id) } : prev));
    } catch (err) {
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not remove recipient", tone: "error" });
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

  const canAddRecipient = recipMode === "booking" ? Boolean(bookingId) : rName.trim().length > 0 && rContact.trim().length > 0;
  const timeline = [...shipment.milestones].reverse();

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/collect-uk/companies/${company.id}/shipments`} className="text-sm font-medium text-muted hover:text-primary">
        ← All shipments
      </Link>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-text">{shipment.reference}</h1>
            {shipment.destinationCountry && <p className="mt-0.5 text-sm text-muted">To {shipment.destinationCountry}</p>}
          </div>
          <ShipmentStatusBadge status={shipment.status} />
        </div>
      </Card>

      {/* Post an update */}
      <Card>
        <h2 className="text-base font-semibold text-text">Post a transit update</h2>
        <p className="mt-1 text-sm text-muted">
          Every recipient on this shipment gets a text with the update and their tracking link.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setStage(p)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                stage === p ? "border-primary bg-primary-light text-primary" : "border-border text-muted hover:text-text"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <form onSubmit={handlePost} className="mt-4 flex flex-col gap-4">
          <Field label="Stage" required>
            {p => <Input {...p} value={stage} onChange={e => setStage(e.target.value)} placeholder="e.g. Arrived at Walvis Bay" />}
          </Field>
          <Field label="Location" hint="Optional">
            {p => <Input {...p} value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Walvis Bay" />}
          </Field>
          <Field label="Note" hint="Optional — added to the text">
            {p => <Textarea {...p} value={note} onChange={e => setNote(e.target.value)} placeholder="Anything else customers should know" />}
          </Field>

          {!showPickup && (
            <button type="button" onClick={() => setShowPickup(true)} className="self-start text-sm font-medium text-primary">
              + Add pickup details (for the final “ready for collection” update)
            </button>
          )}
          {showPickup && (
            <div className="flex flex-col gap-4 rounded-md border border-border p-3">
              <Field label="Storage / pickup address">
                {p => <Input {...p} value={pickupAddress} onChange={e => setPickupAddress(e.target.value)} placeholder="e.g. 12 Samora Machel Ave, Harare" />}
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Pickup from">
                  {p => <Input {...p} type="date" value={pickupFrom} onChange={e => setPickupFrom(e.target.value)} />}
                </Field>
                <Field label="Pickup until">
                  {p => <Input {...p} type="date" value={pickupTo} onChange={e => setPickupTo(e.target.value)} />}
                </Field>
              </div>
            </div>
          )}

          <Field label="Also update shipment status" hint="Optional">
            {p => (
              <Select
                {...p}
                value={setStatus}
                onValueChange={setSetStatus}
                placeholder="No change"
                options={SHIPMENT_STATUS_OPTIONS}
              />
            )}
          </Field>

          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} className="h-4 w-4 accent-primary" />
            Text all recipients now
          </label>

          {postError && <Alert tone="error">{postError}</Alert>}
          <Button type="submit" size="md" loading={posting} disabled={!stage.trim()}>
            Post update
          </Button>
        </form>
      </Card>

      {/* Timeline */}
      <Card>
        <h2 className="text-base font-semibold text-text">Timeline</h2>
        {timeline.length === 0 && <p className="mt-3 text-sm text-muted">No updates posted yet.</p>}
        {timeline.length > 0 && (
          <ol className="mt-3 flex flex-col gap-3">
            {timeline.map((m: CollectUkShipmentMilestone) => (
              <li key={m.id} className="border-l-2 border-primary pl-3">
                <div className="text-sm font-medium text-text">
                  {m.stage}
                  {m.location ? <span className="font-normal text-muted"> · {m.location}</span> : null}
                </div>
                {m.note && <div className="mt-0.5 text-sm text-muted">{m.note}</div>}
                {m.pickupAddress && (
                  <div className="mt-0.5 text-sm text-muted">
                    Ready for collection at {m.pickupAddress}
                    {m.pickupFrom && m.pickupTo ? ` (${formatDate(m.pickupFrom)} – ${formatDate(m.pickupTo)})` : ""}
                  </div>
                )}
                <div className="mt-0.5 text-xs text-muted">
                  {formatDateTime(m.createdAt)} · texted {m.notifiedCount} recipient{m.notifiedCount === 1 ? "" : "s"}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* Recipients */}
      <Card>
        <h2 className="text-base font-semibold text-text">Recipients ({shipment.recipients.length})</h2>
        {shipment.recipients.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {shipment.recipients.map(r => (
              <li key={r.id} className="flex items-center justify-between rounded-md border border-border p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text">{r.customerName}</div>
                  <div className="text-xs text-muted">
                    {r.customerContact}
                    {r.bookingId ? " · from a booking" : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveRecipient(r)}
                  className="text-sm font-medium text-red hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setRecipMode("booking")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${recipMode === "booking" ? "bg-primary-light text-primary" : "text-muted"}`}
          >
            From a booking
          </button>
          <button
            type="button"
            onClick={() => setRecipMode("manual")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${recipMode === "manual" ? "bg-primary-light text-primary" : "text-muted"}`}
          >
            Add manually
          </button>
        </div>

        <form onSubmit={handleAddRecipient} className="mt-3 flex flex-col gap-4">
          {recipMode === "booking" ? (
            <Field label="Booking">
              {p =>
                bookings.length > 0 ? (
                  <Select
                    {...p}
                    value={bookingId}
                    onValueChange={setBookingId}
                    placeholder="Choose a booking"
                    options={bookings.map(b => ({
                      value: b.id,
                      label: `${b.reference ?? "—"} · ${b.customerName}`,
                    }))}
                  />
                ) : (
                  <p className="text-sm text-muted">No bookings yet — switch to “Add manually”.</p>
                )
              }
            </Field>
          ) : (
            <>
              <Field label="Customer name" required>
                {p => <Input {...p} value={rName} onChange={e => setRName(e.target.value)} placeholder="Full name" />}
              </Field>
              <Field label="Mobile number" hint="They'll be texted transit updates" required>
                {p => <Input {...p} value={rContact} onChange={e => setRContact(e.target.value)} placeholder="07… or +44…" />}
              </Field>
            </>
          )}
          {recipError && <Alert tone="error">{recipError}</Alert>}
          <Button type="submit" size="md" variant="secondary" loading={addingRecip} disabled={!canAddRecipient}>
            Add recipient
          </Button>
        </form>
      </Card>
    </div>
  );
}
