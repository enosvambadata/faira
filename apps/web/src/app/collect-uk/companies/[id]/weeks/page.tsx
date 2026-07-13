"use client";

import { useEffect, useState, FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useCompanyPortal } from "@/lib/companyContext";
import { collectUkCompanies, CollectUkCompanyWindow, FulfilmentApiError } from "@/lib/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function CompanyWeeksPage() {
  const { company, isAdmin } = useCompanyPortal();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windows, setWindows] = useState<CollectUkCompanyWindow[]>([]);
  const [winStart, setWinStart] = useState("");
  const [winEnd, setWinEnd] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setWindows(await collectUkCompanies.listWindows(company.id));
      } catch (err) {
        setError(err instanceof FulfilmentApiError ? err.message : "Could not load collection weeks right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, [company.id]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!winStart || !winEnd) return;
    setAdding(true);
    setAddError(null);
    try {
      const window = await collectUkCompanies.createWindow(company.id, { startDate: winStart, endDate: winEnd });
      setWindows(prev => [window, ...prev]);
      setWinStart("");
      setWinEnd("");
      toast({
        title:
          window.attachedBookings > 0
            ? `Collection week added — ${window.attachedBookings} waiting booking${window.attachedBookings === 1 ? "" : "s"} moved into it`
            : "Collection week added",
        tone: "success",
      });
    } catch (err) {
      setAddError(err instanceof FulfilmentApiError ? err.message : "Could not add this collection week.");
    } finally {
      setAdding(false);
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
      <h2 className="text-base font-semibold text-text">Collection weeks</h2>
      <p className="mt-1 text-sm text-muted">
        Tell Faira which days we should collect for you — customers book into your next week and we
        route the drivers. Declaring a week also picks up every booking that was waiting.
      </p>

      {windows.length === 0 && (
        <p className="mt-3 text-sm text-muted">
          No collection weeks yet — bookings are still accepted and will wait for your first week.
        </p>
      )}
      {windows.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {windows.map(w => (
            <li key={w.id} className="rounded-md border border-border p-3 text-sm text-text">
              {formatDate(w.startDate)} – {formatDate(w.endDate)}
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <form onSubmit={handleAdd} className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
          <h3 className="text-sm font-medium text-text">Add a collection week</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="First day" required>
              {p => <Input {...p} type="date" value={winStart} onChange={e => setWinStart(e.target.value)} />}
            </Field>
            <Field label="Last day" required>
              {p => <Input {...p} type="date" value={winEnd} onChange={e => setWinEnd(e.target.value)} />}
            </Field>
          </div>
          {addError && <Alert tone="error">{addError}</Alert>}
          <Button type="submit" size="md" loading={adding} disabled={!winStart || !winEnd}>
            Add collection week
          </Button>
        </form>
      )}
    </Card>
  );
}
