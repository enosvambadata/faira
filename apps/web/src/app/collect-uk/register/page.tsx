"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { collectUkCompanies, FulfilmentApiError } from "@/lib/api";

export default function RegisterCompanyPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [countriesServed, setCountriesServed] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const countries = countriesServed
      .split(",")
      .map(c => c.trim())
      .filter(Boolean);
    if (!name.trim() || countries.length === 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const company = await collectUkCompanies.create({ name: name.trim(), countriesServed: countries });
      router.push(`/collect-uk/companies/${company.id}`);
    } catch (err) {
      setError(err instanceof FulfilmentApiError ? err.message : "Could not register your company right now.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto max-w-2xl px-6 py-3">
          <span className="text-lg font-semibold text-primary">Faira Collect — Company Portal</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="text-xl font-semibold text-text">Register your company</h1>
        <p className="mt-1 text-sm text-muted">
          You&apos;ll become the first admin for this company and can invite teammates afterwards.
        </p>

        <Card className="mt-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Company name" required>
              {p => <Input {...p} value={name} onChange={e => setName(e.target.value)} placeholder="ABC Logistics" autoFocus />}
            </Field>

            <Field label="Countries served" hint="Comma-separated, e.g. Zimbabwe, Zambia" required>
              {p => (
                <Input
                  {...p}
                  value={countriesServed}
                  onChange={e => setCountriesServed(e.target.value)}
                  placeholder="Zimbabwe, Zambia"
                />
              )}
            </Field>

            {error && <Alert tone="error">{error}</Alert>}

            <Button type="submit" size="lg" loading={submitting} disabled={!name.trim() || !countriesServed.trim()}>
              Register company
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}
