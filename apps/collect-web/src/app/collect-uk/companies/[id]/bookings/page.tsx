"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { describeItems } from "@/lib/collectUkItemLabels";
import { useCompanyPortal } from "@/lib/companyContext";
import { collectUkCompanies, CollectUkBookingSummary, FulfilmentApiError } from "@/lib/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function CompanyBookingsPage() {
  const { company } = useCompanyPortal();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<CollectUkBookingSummary[]>([]);
  const [confirmingHandoverId, setConfirmingHandoverId] = useState<string | null>(null);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setBookings(await collectUkCompanies.listBookings(company.id));
      } catch (err) {
        setError(err instanceof FulfilmentApiError ? err.message : "Could not load bookings right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, [company.id]);

  const handleConfirmHandover = async (bookingId: string) => {
    setConfirmingHandoverId(bookingId);
    try {
      await collectUkCompanies.confirmHandover(company.id, bookingId);
      setBookings(prev => prev.map(b => (b.id === bookingId ? { ...b, status: "HANDED_OVER" } : b)));
      toast({ title: "Handover confirmed", tone: "success" });
    } catch (err) {
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not confirm handover right now.", tone: "error" });
    } finally {
      setConfirmingHandoverId(null);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    setCancellingBookingId(bookingId);
    try {
      await collectUkCompanies.cancelBooking(company.id, bookingId);
      setBookings(prev => prev.map(b => (b.id === bookingId ? { ...b, status: "CANCELLED" } : b)));
      setConfirmCancelId(null);
      toast({ title: "Booking cancelled", tone: "success" });
    } catch (err) {
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not cancel this booking.", tone: "error" });
    } finally {
      setCancellingBookingId(null);
    }
  };

  if (loading) {
    return (
      <Card className="flex flex-col gap-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-full" />
      </Card>
    );
  }
  if (error) return <Alert tone="error">{error}</Alert>;

  return (
    <Card>
      <h2 className="text-base font-semibold text-text">Bookings</h2>

      {bookings.length === 0 && <p className="mt-3 text-sm text-muted">No bookings yet.</p>}

      {bookings.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3">
          {bookings.map(b => (
            <li key={b.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-text">{b.reference}</span>
                <StatusBadge label={b.status.replaceAll("_", " ")} tone="neutral" />
              </div>
              <p className="mt-1 text-muted">
                {b.customerName} — {b.destinationCountry}
              </p>
              <p className="text-muted">
                {b.numberOfParcels} parcel{b.numberOfParcels === 1 ? "" : "s"}
                {b.itemTypes.length > 0 && <> · {describeItems(b.itemTypes, b.itemTypeOther, b.vehicleType)}</>}
              </p>
              <p className="text-muted">
                {b.collectionAddress}, {b.collectionPostcode} —{" "}
                {b.collectionWindow
                  ? `week ${formatDate(b.collectionWindow.startDate)} – ${formatDate(b.collectionWindow.endDate)}`
                  : b.preferredDate
                    ? `collect by ${formatDate(b.preferredDate)}`
                    : "awaiting a collection week"}
              </p>
              {b.status === "AT_WAREHOUSE" && (
                <Button
                  type="button"
                  size="md"
                  className="mt-2"
                  loading={confirmingHandoverId === b.id}
                  onClick={() => handleConfirmHandover(b.id)}
                >
                  Confirm handover
                </Button>
              )}
              {["REQUESTED", "DRIVER_ASSIGNED", "EN_ROUTE"].includes(b.status) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {confirmCancelId !== b.id ? (
                    <Button type="button" variant="ghost" size="md" onClick={() => setConfirmCancelId(b.id)}>
                      Cancel booking
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="danger"
                        size="md"
                        loading={cancellingBookingId === b.id}
                        onClick={() => handleCancelBooking(b.id)}
                      >
                        Yes, cancel it
                      </Button>
                      <Button type="button" variant="ghost" size="md" onClick={() => setConfirmCancelId(null)}>
                        Keep it
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
