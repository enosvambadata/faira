"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { shipments as shipmentsApi, hubs as hubsApi, Hub, ParcelSizeTier, FulfilmentApiError } from "@/lib/api";

const SIZE_TIER_OPTIONS: { value: ParcelSizeTier; label: string }[] = [
  { value: "SMALL", label: "Small — fits in a shoebox" },
  { value: "MEDIUM", label: "Medium — fits in a backpack" },
  { value: "LARGE", label: "Large — fits in a suitcase" },
  { value: "EXTRA_LARGE", label: "Extra large — bigger than a suitcase" },
];

interface FormState {
  buyerName: string;
  buyerContact: string;
  originHubId: string;
  destinationHubId: string;
  category: string;
  description: string;
  declaredValue: string;
  sizeTier: ParcelSizeTier | "";
}

const EMPTY_FORM: FormState = {
  buyerName: "",
  buyerContact: "",
  originHubId: "",
  destinationHubId: "",
  category: "",
  description: "",
  declaredValue: "",
  sizeTier: "",
};

export default function NewShipmentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hubOptions, setHubOptions] = useState<Hub[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    hubsApi
      .list()
      .then(setHubOptions)
      .finally(() => setLoading(false));
  }, []);

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.buyerName.trim()) next.buyerName = "Enter the buyer's name";
    if (!/^\+[1-9]\d{6,14}$/.test(form.buyerContact.trim())) next.buyerContact = "Use international format, e.g. +263771234567";
    if (!form.originHubId) next.originHubId = "Choose an origin hub";
    if (!form.destinationHubId) next.destinationHubId = "Choose a destination hub";
    if (form.originHubId && form.originHubId === form.destinationHubId) next.destinationHubId = "Must be different from the origin hub";
    if (!form.category.trim()) next.category = "Enter a category";
    const value = Number(form.declaredValue);
    if (!form.declaredValue || Number.isNaN(value) || value <= 0) next.declaredValue = "Enter the declared value";
    if (!form.sizeTier) next.sizeTier = "Choose a parcel size";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const draft = await shipmentsApi.create({
        buyerName: form.buyerName.trim(),
        buyerContact: form.buyerContact.trim(),
        originHubId: form.originHubId,
        destinationHubId: form.destinationHubId,
        category: form.category.trim(),
        description: form.description.trim() || undefined,
        declaredValue: Number(form.declaredValue),
        sizeTier: form.sizeTier as ParcelSizeTier,
      });
      router.push(`/shipments/${draft.id}`);
    } catch (err) {
      setSubmitError(err instanceof FulfilmentApiError ? err.message : "Could not create this shipment right now");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <Skeleton className="h-96 w-full max-w-xl" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-xl">
        <h1 className="text-xl font-semibold text-text">Create a shipment</h1>
        <p className="mt-1 text-sm text-muted">Enter the buyer and parcel details to get started.</p>

        <Card className="mt-6">
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <Field label="Buyer name" error={errors.buyerName} required>
              {p => <Input {...p} value={form.buyerName} onChange={e => setForm({ ...form, buyerName: e.target.value })} />}
            </Field>

            <Field label="Buyer contact" hint="Phone or WhatsApp number, e.g. +263771234567" error={errors.buyerContact} required>
              {p => <Input {...p} value={form.buyerContact} onChange={e => setForm({ ...form, buyerContact: e.target.value })} />}
            </Field>

            <Field label="Origin hub" hint="Where you'll drop off the parcel" error={errors.originHubId} required>
              {p => (
                <Select
                  {...p}
                  value={form.originHubId || undefined}
                  onValueChange={value => setForm({ ...form, originHubId: value })}
                  options={hubOptions.map(hub => ({ value: hub.id, label: `${hub.name} — ${hub.city}` }))}
                  placeholder="Choose a hub"
                />
              )}
            </Field>

            <Field label="Destination hub" hint="Where the buyer will collect it" error={errors.destinationHubId} required>
              {p => (
                <Select
                  {...p}
                  value={form.destinationHubId || undefined}
                  onValueChange={value => setForm({ ...form, destinationHubId: value })}
                  options={hubOptions.map(hub => ({ value: hub.id, label: `${hub.name} — ${hub.city}` }))}
                  placeholder="Choose a hub"
                />
              )}
            </Field>

            <Field label="Category" error={errors.category} required>
              {p => <Input {...p} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />}
            </Field>

            <Field label="Description" hint="Optional, but helps hub staff identify the item">
              {p => <Textarea {...p} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />}
            </Field>

            <Field label="Declared value (USD)" error={errors.declaredValue} required>
              {p => (
                <Input
                  {...p}
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.declaredValue}
                  onChange={e => setForm({ ...form, declaredValue: e.target.value })}
                />
              )}
            </Field>

            <Field label="Parcel size" error={errors.sizeTier} required>
              {p => (
                <Select
                  {...p}
                  value={form.sizeTier || undefined}
                  onValueChange={value => setForm({ ...form, sizeTier: value as ParcelSizeTier })}
                  options={SIZE_TIER_OPTIONS}
                  placeholder="Choose a size"
                />
              )}
            </Field>

            {submitError && <Alert tone="error">{submitError}</Alert>}

            <Button type="submit" size="lg" loading={submitting}>
              Continue
            </Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
