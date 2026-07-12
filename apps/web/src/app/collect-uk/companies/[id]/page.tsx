"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import {
  collectUkCompanies,
  CollectUkCompany,
  CollectUkWarehouse,
  CollectUkCompanyRoleType,
  CollectUkBookingSummary,
  FulfilmentApiError,
} from "@/lib/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function CompanyDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<CollectUkCompany | null>(null);
  const [myRole, setMyRole] = useState<CollectUkCompanyRoleType | null>(null);
  const [warehouses, setWarehouses] = useState<CollectUkWarehouse[]>([]);
  const [bookings, setBookings] = useState<CollectUkBookingSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const [name, setName] = useState("");
  const [countriesServed, setCountriesServed] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [whName, setWhName] = useState("");
  const [whAddress, setWhAddress] = useState("");
  const [whCity, setWhCity] = useState("");
  const [whPostcode, setWhPostcode] = useState("");
  const [whHours, setWhHours] = useState("");
  const [addingWarehouse, setAddingWarehouse] = useState(false);
  const [warehouseError, setWarehouseError] = useState<string | null>(null);
  const [confirmingHandoverId, setConfirmingHandoverId] = useState<string | null>(null);

  const isAdmin = myRole === "COMPANY_ADMIN";

  useEffect(() => {
    (async () => {
      try {
        const [memberships, companyDetail, warehouseList, bookingList] = await Promise.all([
          collectUkCompanies.mine(),
          collectUkCompanies.get(id),
          collectUkCompanies.listWarehouses(id),
          collectUkCompanies.listBookings(id),
        ]);
        setCompany(companyDetail);
        setName(companyDetail.name);
        setCountriesServed(companyDetail.countriesServed.join(", "));
        setWarehouses(warehouseList);
        setBookings(bookingList);
        setMyRole(memberships.find(m => m.id === id)?.role ?? null);
      } catch (err) {
        setError(err instanceof FulfilmentApiError ? err.message : "Could not load this company right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!company) return;
    const countries = countriesServed.split(",").map(c => c.trim()).filter(Boolean);
    if (!name.trim() || countries.length === 0) return;

    setSavingProfile(true);
    try {
      const updated = await collectUkCompanies.update(company.id, { name: name.trim(), countriesServed: countries });
      setCompany(updated);
      toast({ title: "Company profile updated", tone: "success" });
    } catch (err) {
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not save changes", tone: "error" });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAddWarehouse = async (e: FormEvent) => {
    e.preventDefault();
    if (!company || !whName.trim() || !whAddress.trim() || !whCity.trim() || !whPostcode.trim() || !whHours.trim()) return;

    setAddingWarehouse(true);
    setWarehouseError(null);
    try {
      const warehouse = await collectUkCompanies.createWarehouse(company.id, {
        name: whName.trim(),
        address: whAddress.trim(),
        city: whCity.trim(),
        postcode: whPostcode.trim(),
        openingHours: whHours.trim(),
      });
      setWarehouses(prev => [...prev, warehouse]);
      setWhName("");
      setWhAddress("");
      setWhCity("");
      setWhPostcode("");
      setWhHours("");
      toast({ title: "Warehouse added", tone: "success" });
    } catch (err) {
      setWarehouseError(err instanceof FulfilmentApiError ? err.message : "Could not add this warehouse right now.");
    } finally {
      setAddingWarehouse(false);
    }
  };

  const handleConfirmHandover = async (bookingId: string) => {
    if (!company) return;
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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3">
          <span className="text-lg font-semibold text-primary">Faira Collect — Company Portal</span>
          <Link href="/collect-uk" className="text-sm font-medium text-muted hover:text-text">
            All companies
          </Link>
        </div>
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
              <StatusBadge label={isAdmin ? "Admin" : "Dispatcher"} tone="info" />
            </div>

            <Card className="mt-6">
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
              <h2 className="text-base font-semibold text-text">Company profile</h2>
              {isAdmin ? (
                <form onSubmit={handleSaveProfile} className="mt-4 flex flex-col gap-4">
                  <Field label="Company name" required>
                    {p => <Input {...p} value={name} onChange={e => setName(e.target.value)} />}
                  </Field>
                  <Field label="Countries served" hint="Comma-separated" required>
                    {p => <Input {...p} value={countriesServed} onChange={e => setCountriesServed(e.target.value)} />}
                  </Field>
                  <Button type="submit" size="md" loading={savingProfile} disabled={!name.trim() || !countriesServed.trim()}>
                    Save changes
                  </Button>
                </form>
              ) : (
                <dl className="mt-4 flex flex-col gap-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Countries served</dt>
                    <dd className="text-right text-text">{company.countriesServed.join(", ")}</dd>
                  </div>
                </dl>
              )}
            </Card>

            <Card className="mt-4">
              <h2 className="text-base font-semibold text-text">Warehouses</h2>

              {warehouses.length === 0 && <p className="mt-3 text-sm text-muted">No warehouses added yet.</p>}

              {warehouses.length > 0 && (
                <ul className="mt-3 flex flex-col gap-3">
                  {warehouses.map(w => (
                    <li key={w.id} className="rounded-md border border-border p-3 text-sm">
                      <p className="font-medium text-text">{w.name}</p>
                      <p className="text-muted">
                        {w.address}, {w.city} {w.postcode}
                      </p>
                      <p className="text-muted">{w.openingHours}</p>
                    </li>
                  ))}
                </ul>
              )}

              {isAdmin && (
                <form onSubmit={handleAddWarehouse} className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
                  <h3 className="text-sm font-medium text-text">Add a warehouse</h3>
                  <Field label="Warehouse name" required>
                    {p => <Input {...p} value={whName} onChange={e => setWhName(e.target.value)} placeholder="Main Depot" />}
                  </Field>
                  <Field label="Address" required>
                    {p => <Input {...p} value={whAddress} onChange={e => setWhAddress(e.target.value)} />}
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="City" required>
                      {p => <Input {...p} value={whCity} onChange={e => setWhCity(e.target.value)} />}
                    </Field>
                    <Field label="Postcode" required>
                      {p => <Input {...p} value={whPostcode} onChange={e => setWhPostcode(e.target.value)} />}
                    </Field>
                  </div>
                  <Field label="Opening hours" required>
                    {p => <Input {...p} value={whHours} onChange={e => setWhHours(e.target.value)} placeholder="Mon-Fri 9am-5pm" />}
                  </Field>
                  {warehouseError && <Alert tone="error">{warehouseError}</Alert>}
                  <Button
                    type="submit"
                    size="md"
                    loading={addingWarehouse}
                    disabled={!whName.trim() || !whAddress.trim() || !whCity.trim() || !whPostcode.trim() || !whHours.trim()}
                  >
                    Add warehouse
                  </Button>
                </form>
              )}
            </Card>

            <Card className="mt-4">
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
                        {b.collectionAddress}, {b.collectionPostcode} — collect by {formatDate(b.preferredDate)}
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
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
