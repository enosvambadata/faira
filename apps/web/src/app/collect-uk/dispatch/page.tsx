"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDispatchAuth } from "@/lib/dispatchContext";
import { collectUkDispatch, CollectUkAdminOverview, FulfilmentApiError } from "@/lib/api";

function formatWeek(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function formatMoney(pence: number): string {
  return `£${(pence / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// A single headline number. `href` turns it into a shortcut to the tab that
// acts on it; `highlight` draws the eye when there's work waiting.
function Stat({
  label,
  value,
  sub,
  href,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
  highlight?: boolean;
}) {
  const body = (
    <div
      className={`flex h-full flex-col rounded-lg border p-4 transition-colors duration-200 ${
        highlight ? "border-warning/50 bg-warning/5" : "border-border"
      } ${href ? "cursor-pointer hover:border-primary" : ""}`}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className="mt-1 text-2xl font-semibold text-text">{value}</span>
      {sub && <span className="mt-0.5 text-xs text-muted">{sub}</span>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

// The dispatcher's at-a-glance dashboard: platform size, the day's workload,
// throughput, revenue, and how bookings are trending. Read-only — every
// number links out to the tab that acts on it.
export default function DispatchOverviewPage() {
  const { token, authFailure } = useDispatchAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overview, setOverview] = useState<CollectUkAdminOverview | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setOverview(await collectUkDispatch.getOverview(token));
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.status === 401) return authFailure();
      setLoadError(err instanceof FulfilmentApiError ? err.message : "Could not load the overview right now.");
    } finally {
      setLoading(false);
    }
  }, [token, authFailure]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Card className="flex flex-col gap-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-full" />
      </Card>
    );
  }
  if (loadError) return <Alert tone="error">{loadError}</Alert>;
  if (!overview) return null;

  const peakWeek = Math.max(1, ...overview.weeklyBookings.map(w => w.count));

  return (
    <>
      <h1 className="text-xl font-semibold text-text">Overview</h1>
      <p className="mt-1 text-sm text-muted">Live snapshot of the Collect UK network.</p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Companies"
          value={String(overview.companies.total)}
          sub={`${overview.companies.active} active`}
          href="/collect-uk/dispatch/companies"
        />
        <Stat
          label="Active drivers"
          value={String(overview.drivers.active)}
          href="/collect-uk/dispatch/drivers"
        />
        <Stat
          label="Applications to review"
          value={String(overview.drivers.pendingApplications)}
          sub={overview.drivers.pendingApplications > 0 ? "Needs review" : "All clear"}
          href="/collect-uk/dispatch/drivers"
          highlight={overview.drivers.pendingApplications > 0}
        />
        <Stat
          label="Bookings this week"
          value={String(overview.bookings.thisWeek)}
          sub={`${overview.bookings.total} all-time`}
        />
        <Stat
          label="Unscheduled"
          value={String(overview.bookings.unscheduled)}
          sub={overview.bookings.unscheduled > 0 ? "Waiting to route" : "Queue clear"}
          href="/collect-uk/dispatch/queue"
          highlight={overview.bookings.unscheduled > 0}
        />
        <Stat label="Collections completed" value={String(overview.collectionsCompleted)} sub={`${overview.handedOver} handed over`} />
      </div>

      <Card className="mt-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-text">Revenue billed</h2>
          <span className="text-2xl font-semibold text-text">{formatMoney(overview.revenueBilledPence)}</span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Total charged to companies across every confirmed handover to date.
        </p>
      </Card>

      <Card className="mt-3">
        <h2 className="text-base font-semibold text-text">Bookings — last 8 weeks</h2>
        <div className="mt-4 flex items-end justify-between gap-2" style={{ height: "140px" }}>
          {overview.weeklyBookings.map((w, i) => {
            const isCurrent = i === overview.weeklyBookings.length - 1;
            return (
              <div key={w.weekStart} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span className="text-xs font-medium text-text">{w.count}</span>
                <div
                  className={`w-full rounded-t ${isCurrent ? "bg-primary" : "bg-primary/40"}`}
                  style={{ height: `${Math.round((w.count / peakWeek) * 100)}%`, minHeight: w.count > 0 ? "4px" : "0" }}
                  aria-hidden
                />
                <span className="text-[10px] text-muted">{formatWeek(w.weekStart)}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">Bookings created per week (Mon–Sun); the last bar is the current week.</p>
      </Card>
    </>
  );
}
