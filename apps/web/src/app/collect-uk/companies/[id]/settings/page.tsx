"use client";

import { useState, FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useCompanyPortal } from "@/lib/companyContext";
import { CustomerBrand } from "@/components/collect-uk/CustomerBrand";
import { collectUkCompanies, FulfilmentApiError } from "@/lib/api";

export default function CompanySettingsPage() {
  const { company, isAdmin, setCompany } = useCompanyPortal();
  const { toast } = useToast();

  const [name, setName] = useState(company.name);
  const [countriesServed, setCountriesServed] = useState(company.countriesServed.join(", "));
  const [saving, setSaving] = useState(false);

  const [brandName, setBrandName] = useState(company.brandName ?? "");
  const [logoUrl, setLogoUrl] = useState(company.logoUrl ?? "");
  const [savingBrand, setSavingBrand] = useState(false);

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

  const handleSaveBrand = async (e: FormEvent) => {
    e.preventDefault();
    setSavingBrand(true);
    try {
      const updated = await collectUkCompanies.update(company.id, {
        brandName: brandName.trim() || null,
        logoUrl: logoUrl.trim() || null,
      });
      setCompany(updated);
      toast({ title: "Branding updated", tone: "success" });
    } catch (err) {
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not save branding", tone: "error" });
    } finally {
      setSavingBrand(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
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

      {isAdmin && (
        <Card>
          <h2 className="text-base font-semibold text-text">Branding</h2>
          <p className="mt-1 text-sm text-muted">
            This is what your customers see on your booking page, tracking pages and card checkout — your name and logo,
            not ours.
          </p>

          <div className="mt-4 rounded-md border border-border bg-light p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Preview</p>
            <CustomerBrand name={brandName.trim() || company.name} logoUrl={logoUrl.trim() || null} />
          </div>

          <form onSubmit={handleSaveBrand} className="mt-4 flex flex-col gap-4">
            <Field label="Brand name" hint="Defaults to your company name if left blank">
              {p => <Input {...p} value={brandName} onChange={e => setBrandName(e.target.value)} placeholder={company.name} />}
            </Field>
            <Field label="Logo URL" hint="A public image link (https://…). Square works best.">
              {p => <Input {...p} type="url" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://yoursite.com/logo.png" />}
            </Field>
            <Button type="submit" size="md" loading={savingBrand}>
              Save branding
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
