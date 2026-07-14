"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Alert } from "@/components/ui/Alert";
import { collectUkCompanies, collectUkDriverPortal, CollectUkCompanyMembership, CollectUkDriverProfile, FulfilmentApiError } from "@/lib/api";
import { CollectBrand } from "@/components/collect-uk/CollectBrand";

export default function CollectUkHomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<CollectUkCompanyMembership[]>([]);
  const [driver, setDriver] = useState<CollectUkDriverProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [mine, me] = await Promise.all([collectUkCompanies.mine(), collectUkDriverPortal.me()]);
        setCompanies(mine);
        setDriver(me);
      } catch (err) {
        setError(err instanceof FulfilmentApiError ? err.message : "Could not load your companies right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isLiveDriver = Boolean(driver && driver.status !== "REJECTED");
  const isCompanyMember = companies.length > 0;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3">
          <CollectBrand />
          <Button
            variant="ghost"
            size="md"
            onClick={async () => {
              await createClient().auth.signOut();
              router.push("/login");
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        {!isLiveDriver && (
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-text">Your companies</h1>
            <Link href="/collect-uk/register">
              <Button size="md">Register a company</Button>
            </Link>
          </div>
        )}

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

        {!loading && !error && !isLiveDriver && companies.length === 0 && (
          <Card className="mt-6">
            <p className="text-sm text-muted">You aren&apos;t part of any company yet.</p>
          </Card>
        )}

        {!loading && companies.length > 0 && (
          <div className="mt-6 flex flex-col gap-3">
            {companies.map(company => (
              <Link key={company.id} href={`/collect-uk/companies/${company.id}`}>
                <Card className="flex items-center justify-between transition hover:border-primary">
                  <div>
                    <p className="font-medium text-text">{company.name}</p>
                    <p className="text-sm text-muted">{company.countriesServed.join(", ")}</p>
                  </div>
                  <StatusBadge label={company.role === "COMPANY_ADMIN" ? "Admin" : "Dispatcher"} tone="info" />
                </Card>
              </Link>
            ))}
          </div>
        )}

        {!loading && !isCompanyMember && (
          <div className="mt-8 flex items-center justify-between">
            <h2 className="text-base font-semibold text-text">Driving for Faira</h2>
          </div>
        )}
        {!loading && !isCompanyMember && (
          <Card className="mt-3">
            {driver?.status === "ACTIVE" && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-text">You&rsquo;re an approved Faira driver.</p>
                <Link href="/collect-uk/driver">
                  <Button size="md">Open driver portal</Button>
                </Link>
              </div>
            )}
            {driver?.status === "APPLIED" && (
              <p className="text-sm text-muted">
                Your driver application is being reviewed — we&rsquo;ll be in touch once your insurance
                documents are checked.{" "}
                <Link href="/collect-uk/driver" className="cursor-pointer font-medium text-primary underline">
                  View status
                </Link>
              </p>
            )}
            {driver?.status === "REJECTED" && (
              <p className="text-sm text-muted">
                Your driver application wasn&rsquo;t approved.{" "}
                <Link href="/collect-uk/driver" className="cursor-pointer font-medium text-primary underline">
                  See why and reapply
                </Link>
              </p>
            )}
            {!driver && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">
                  Got your own van? Earn from collection routes in your area.
                </p>
                <Link href="/collect-uk/drive">
                  <Button size="md" variant="secondary">Apply to drive</Button>
                </Link>
              </div>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}
