"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useCompanyPortal } from "@/lib/companyContext";
import { collectUkCompanies, CollectUkBookingSummary, CollectUkCompanyWindow } from "@/lib/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function CompanyOverviewPage() {
  const { company } = useCompanyPortal();
  const [linkCopied, setLinkCopied] = useState(false);
  const [bookings, setBookings] = useState<CollectUkBookingSummary[]>([]);
  const [windows, setWindows] = useState<CollectUkCompanyWindow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [b, w] = await Promise.all([
          collectUkCompanies.listBookings(company.id),
          collectUkCompanies.listWindows(company.id),
        ]);
        setBookings(b);
        setWindows(w);
      } catch {
        // counters are a nice-to-have on the overview; the dedicated tabs
        // surface their own errors properly
      }
    })();
  }, [company.id]);

  const today = new Date().toISOString().slice(0, 10);
  const nextWindow = windows
    .filter(w => w.endDate.slice(0, 10) >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

  const waiting = bookings.filter(b => b.status === "REQUESTED" && !b.collectionWindow).length;
  const inWeek = bookings.filter(b => b.status === "REQUESTED" && b.collectionWindow).length;
  const parcelsWaiting = bookings.reduce((sum, b) => (b.status === "REQUESTED" ? sum + b.numberOfParcels : sum), 0);

  return (
    <>
      <Card>
        <h2 className="text-base font-semibold text-text">Your booking link</h2>
        <p className="mt-1 text-sm text-muted">Share this with customers so they can book a collection directly.</p>
        <div className="mt-3 flex items-center gap-2">
          <code className="flex-1 truncate rounded-md bg-light px-3 py-2 text-sm text-text">
            {typeof window !== "undefined" ? `${window.location.origin}/collect-uk/book/${company.slug}` : ""}
          </code>
          <Button
            type="button"
            size="md"
            variant="secondary"
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/collect-uk/book/${company.slug}`);
              setLinkCopied(true);
              setTimeout(() => setLinkCopied(false), 2000);
            }}
          >
            {linkCopied ? "Copied!" : "Copy"}
          </Button>
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="text-base font-semibold text-text">Demand</h2>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-md border border-border bg-bg p-3">
            <p className="text-2xl font-bold text-primary">{waiting}</p>
            <p className="text-xs text-muted">awaiting a collection week</p>
          </div>
          <div className="rounded-md border border-border bg-bg p-3">
            <p className="text-2xl font-bold text-text">{inWeek}</p>
            <p className="text-xs text-muted">booked into a week</p>
          </div>
          <div className="rounded-md border border-border bg-bg p-3">
            <p className="text-2xl font-bold text-text">{parcelsWaiting}</p>
            <p className="text-xs text-muted">parcels waiting collection</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted">
          {nextWindow ? (
            <>
              Next collection week:{" "}
              <span className="font-semibold text-text">
                {formatDate(nextWindow.startDate)} – {formatDate(nextWindow.endDate)}
              </span>
            </>
          ) : (
            <>
              No collection week declared —{" "}
              <Link
                href={`/collect-uk/companies/${company.id}/weeks`}
                className="cursor-pointer font-medium text-primary underline"
              >
                add one
              </Link>{" "}
              when you&rsquo;re ready to receive.
            </>
          )}
        </p>
      </Card>
    </>
  );
}
