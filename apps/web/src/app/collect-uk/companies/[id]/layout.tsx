"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { CollectBrand } from "@/components/collect-uk/CollectBrand";
import { CompanyContext } from "@/lib/companyContext";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { collectUkCompanies, CollectUkCompany, CollectUkCompanyRoleType, FulfilmentApiError } from "@/lib/api";

const TABS = [
  { seg: "", label: "Overview" },
  { seg: "bookings", label: "Bookings" },
  { seg: "receive", label: "Receive" },
  { seg: "shipments", label: "Shipments" },
  { seg: "pricing", label: "Pricing" },
  { seg: "payments", label: "Payments" },
  { seg: "weeks", label: "Collection weeks" },
  { seg: "warehouses", label: "Warehouses" },
  { seg: "billing", label: "Billing" },
  { seg: "team", label: "Team" },
  { seg: "settings", label: "Settings" },
];

// One shell for the whole company portal: loads the company and the
// caller's role once, renders the tab navigation, and provides both to
// the section pages via CompanyContext.
export default function CompanyPortalLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<CollectUkCompany | null>(null);
  const [role, setRole] = useState<CollectUkCompanyRoleType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [memberships, companyDetail] = await Promise.all([collectUkCompanies.mine(), collectUkCompanies.get(id)]);
        setCompany(companyDetail);
        setRole(memberships.find(m => m.id === id)?.role ?? null);
      } catch (err) {
        setError(err instanceof FulfilmentApiError ? err.message : "Could not load this company right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const base = `/collect-uk/companies/${id}`;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white print:hidden">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-6 py-3">
          <CollectBrand suffix="Company Portal" />
          <div className="flex items-center gap-2">
            <Link
              href="/collect-uk"
              className="cursor-pointer px-2 text-sm font-medium text-muted transition-colors duration-200 hover:text-primary"
            >
              All companies
            </Link>
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
        </div>
        {company && (
          <nav
            aria-label="Company sections"
            className="mx-auto flex w-full max-w-2xl gap-1 overflow-x-auto px-4 sm:px-6"
          >
            {TABS.map(tab => {
              const href = tab.seg ? `${base}/${tab.seg}` : base;
              const active = tab.seg ? pathname.startsWith(href) : pathname === base;
              return (
                <Link
                  key={tab.seg}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`cursor-pointer whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                    active ? "border-primary text-primary" : "border-transparent text-muted hover:text-text"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        {loading && (
          <Card className="flex flex-col gap-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
          </Card>
        )}

        {!loading && error && <Alert tone="error">{error}</Alert>}

        {!loading && company && (
          <>
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold text-text">{company.name}</h1>
              <StatusBadge label={role === "COMPANY_ADMIN" ? "Admin" : "Dispatcher"} tone="info" />
            </div>
            <div className="mt-4">
              <CompanyContext.Provider value={{ company, role, isAdmin: role === "COMPANY_ADMIN", setCompany }}>
                {children}
              </CompanyContext.Provider>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
