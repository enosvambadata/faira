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
import { collectUkCompanies, CollectUkWarehouse, FulfilmentApiError } from "@/lib/api";

export default function CompanyWarehousesPage() {
  const { company, isAdmin } = useCompanyPortal();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<CollectUkWarehouse[]>([]);

  const [whName, setWhName] = useState("");
  const [whAddress, setWhAddress] = useState("");
  const [whCity, setWhCity] = useState("");
  const [whPostcode, setWhPostcode] = useState("");
  const [whHours, setWhHours] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setWarehouses(await collectUkCompanies.listWarehouses(company.id));
      } catch (err) {
        setError(err instanceof FulfilmentApiError ? err.message : "Could not load warehouses right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, [company.id]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!whName.trim() || !whAddress.trim() || !whCity.trim() || !whPostcode.trim() || !whHours.trim()) return;
    setAdding(true);
    setAddError(null);
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
      setAddError(err instanceof FulfilmentApiError ? err.message : "Could not add this warehouse right now.");
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
        <form onSubmit={handleAdd} className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
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
          {addError && <Alert tone="error">{addError}</Alert>}
          <Button
            type="submit"
            size="md"
            loading={adding}
            disabled={!whName.trim() || !whAddress.trim() || !whCity.trim() || !whPostcode.trim() || !whHours.trim()}
          >
            Add warehouse
          </Button>
        </form>
      )}
    </Card>
  );
}
