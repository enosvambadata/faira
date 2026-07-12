"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Alert } from "@/components/ui/Alert";
import { collectUkCompanies, CollectUkCompanyMembership, FulfilmentApiError } from "@/lib/api";
import { CollectBrand } from "@/components/collect-uk/CollectBrand";

export default function CollectUkHomePage() {
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<CollectUkCompanyMembership[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setCompanies(await collectUkCompanies.mine());
      } catch (err) {
        setError(err instanceof FulfilmentApiError ? err.message : "Could not load your companies right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto max-w-2xl px-6 py-3">
          <CollectBrand suffix="Company Portal" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-text">Your companies</h1>
          <Link href="/collect-uk/register">
            <Button size="md">Register a company</Button>
          </Link>
        </div>

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

        {!loading && !error && companies.length === 0 && (
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
      </main>
    </div>
  );
}
