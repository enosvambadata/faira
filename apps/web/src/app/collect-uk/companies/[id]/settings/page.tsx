"use client";

import { useState, FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useCompanyPortal } from "@/lib/companyContext";
import { collectUkCompanies, FulfilmentApiError } from "@/lib/api";

export default function CompanySettingsPage() {
  const { company, isAdmin, setCompany } = useCompanyPortal();
  const { toast } = useToast();

  const [name, setName] = useState(company.name);
  const [countriesServed, setCountriesServed] = useState(company.countriesServed.join(", "));
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const countries = countriesServed.split(",").map(c => c.trim()).filter(Boolean);
    if (!name.trim() || countries.length === 0) return;

    setSaving(true);
    try {
      const updated = await collectUkCompanies.update(company.id, { name: name.trim(), countriesServed: countries });
      setCompany(updated);
      toast({ title: "Company profile updated", tone: "success" });
    } catch (err) {
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not save changes", tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <h2 className="text-base font-semibold text-text">Company profile</h2>
      {isAdmin ? (
        <form onSubmit={handleSave} className="mt-4 flex flex-col gap-4">
          <Field label="Company name" required>
            {p => <Input {...p} value={name} onChange={e => setName(e.target.value)} />}
          </Field>
          <Field label="Countries served" hint="Comma-separated" required>
            {p => <Input {...p} value={countriesServed} onChange={e => setCountriesServed(e.target.value)} />}
          </Field>
          <Button type="submit" size="md" loading={saving} disabled={!name.trim() || !countriesServed.trim()}>
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
  );
}
