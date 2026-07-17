"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { collectUkDriverPortal, CollectUkDriverRouteDetail, FulfilmentApiError } from "@/lib/api";
import { describeItems } from "@/lib/collectUkItemLabels";

// Printable parcel labels for a route -- one label per physical parcel
// per stop ("Parcel i of N"), printed by the driver before departure so
// every box is identified the moment it's collected. Plain print CSS
// (no PDF dependency): the driver opens this page and hits Print.

export default function RouteLabelsPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<CollectUkDriverRouteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setRoute(await collectUkDriverPortal.getRoute(id));
      } catch (err) {
        setError(err instanceof FulfilmentApiError ? err.message : "Could not load this route right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const labels = (route?.stops ?? []).flatMap(stop =>
    Array.from({ length: stop.numberOfParcels }, (_, i) => ({
      key: `${stop.id}-${i}`,
      parcelIndex: i + 1,
      parcelTotal: stop.numberOfParcels,
      stop,
    })),
  );

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .label-card { break-inside: avoid; }
        }
      `}</style>

      <header className="no-print border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3">
          <Link
            href={`/collect-uk/driver/routes/${id}`}
            className="cursor-pointer text-sm font-medium text-muted transition-colors duration-200 hover:text-primary"
          >
            &larr; Back to route
          </Link>
          {route && labels.length > 0 && (
            <Button type="button" size="md" onClick={() => window.print()}>
              Print {labels.length} label{labels.length === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6 print:max-w-none print:p-0">
        {loading && <Skeleton className="h-24 w-full" />}
        {!loading && error && (
          <div className="no-print">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        {!loading && route && labels.length === 0 && (
          <p className="no-print text-sm text-muted">No stops on this route yet — nothing to print.</p>
        )}

        {!loading && route && labels.length > 0 && (
          <>
            <p className="no-print mb-4 text-sm text-muted">
              {labels.length} label{labels.length === 1 ? "" : "s"} across {route.stops.length} stop
              {route.stops.length === 1 ? "" : "s"}. Stick one on each box at collection.
            </p>
            <div className="flex flex-col gap-4">
              {labels.map(label => (
                <div key={label.key} className="label-card rounded-lg border-2 border-dark p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Deliver to warehouse of</p>
                      <p className="text-lg font-bold text-dark">{label.stop.companyName}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {label.stop.bookingReference && (
                        <QRCodeSVG value={label.stop.bookingReference} size={72} marginSize={0} title={`Scan to receive ${label.stop.bookingReference}`} />
                      )}
                      <div className="rounded-md border-2 border-dark px-3 py-1.5 text-center">
                        <p className="text-lg font-bold leading-tight text-dark">
                          {label.parcelIndex} of {label.parcelTotal}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-muted">parcel</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Customer</p>
                    <p className="text-2xl font-bold text-dark">{label.stop.customerName}</p>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Reference</p>
                      <p className="font-mono font-semibold text-dark">{label.stop.bookingReference}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Destination</p>
                      <p className="font-semibold text-dark">{label.stop.destinationCountry}</p>
                    </div>
                    {label.stop.itemTypes.length > 0 && (
                      <div className="col-span-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Contents</p>
                        <p className="font-semibold text-dark">
                          {describeItems(label.stop.itemTypes, label.stop.itemTypeOther, label.stop.vehicleType)}
                        </p>
                      </div>
                    )}
                    <div className="col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Collected from</p>
                      <p className="text-dark">
                        {label.stop.collectionAddress}, {label.stop.collectionPostcode}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
