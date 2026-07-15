"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { createClient } from "@/lib/supabase";
import { collectUkDriverPortal, CollectUkDriverRoute, CollectUkDriverProfile, FulfilmentApiError } from "@/lib/api";
import { CollectBrand } from "@/components/collect-uk/CollectBrand";

const ROUTE_STATUS_TONE: Record<CollectUkDriverRoute["status"], "neutral" | "info" | "success"> = {
  PLANNED: "neutral",
  IN_PROGRESS: "info",
  COMPLETED: "success",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

export default function DriverRoutesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState<CollectUkDriverRoute[]>([]);
  const [profile, setProfile] = useState<CollectUkDriverProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const me = await collectUkDriverPortal.me();
        setProfile(me);
        if (me?.status === "ACTIVE") {
          setRoutes(await collectUkDriverPortal.listRoutes());
        }
      } catch (err) {
        setError(err instanceof FulfilmentApiError ? err.message : "Could not load your routes right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSignOut = async () => {
    await createClient().auth.signOut();
    router.push("/login");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3">
          <CollectBrand suffix="Driver" />
          <Button variant="ghost" size="md" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="text-xl font-semibold text-text">Your routes</h1>

        {loading && (
          <Card className="mt-6 flex flex-col gap-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
          </Card>
        )}

        {!loading && error && (
          <div className="mt-6">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        {!loading && !error && !profile && (
          <Card className="mt-6">
            <p className="text-sm text-text">You&rsquo;re not registered as a Vamba Collect driver yet.</p>
            <p className="mt-1 text-sm text-muted">
              Got your own van and insurance? Apply to drive for Vamba Collect — you set your base area, we
              send you routes.
            </p>
            <Link href="/collect-uk/drive" className="mt-3 inline-block">
              <Button type="button" size="md">Apply to drive</Button>
            </Link>
          </Card>
        )}

        {!loading && !error && profile?.status === "APPLIED" && (
          <div className="mt-6">
            <Alert tone="info">
              Your driver application is being reviewed — we check your insurance documents before
              your first route. We&rsquo;ll be in touch soon.
            </Alert>
          </div>
        )}

        {!loading && !error && profile?.status === "REJECTED" && (
          <Card className="mt-6">
            <Alert tone="error">
              Your application wasn&rsquo;t approved{profile.reviewNotes ? `: ${profile.reviewNotes}` : "."}
            </Alert>
            <p className="mt-3 text-sm text-muted">Fix the issue and apply again — your details are kept.</p>
            <Link href="/collect-uk/drive" className="mt-3 inline-block">
              <Button type="button" size="md" variant="secondary">Reapply</Button>
            </Link>
          </Card>
        )}

        {!loading && !error && profile?.status === "ACTIVE" && routes.length === 0 && (
          <Card className="mt-6">
            <p className="text-sm text-muted">No routes assigned yet.</p>
          </Card>
        )}

        {!loading && routes.length > 0 && (
          <div className="mt-6 flex flex-col gap-3">
            {routes.map(route => (
              <Link key={route.id} href={`/collect-uk/driver/routes/${route.id}`}>
                <Card className="flex items-center justify-between transition hover:border-primary">
                  <span className="font-medium text-text">{formatDate(route.routeDate)}</span>
                  <StatusBadge label={route.status.replaceAll("_", " ")} tone={ROUTE_STATUS_TONE[route.status]} />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
