"use client";

import { useEffect, useState, FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { useCompanyPortal } from "@/lib/companyContext";
import { collectUkPayments, CollectUkPayment, FulfilmentApiError } from "@/lib/api";

const money = (pence: number) => `£${(pence / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS: Record<string, { label: string; tone: "neutral" | "info" | "success" | "error" | "warning" }> = {
  PENDING: { label: "Awaiting payment", tone: "warning" },
  PAID: { label: "Paid", tone: "success" },
  FAILED: { label: "Failed", tone: "error" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

export default function CompanyPaymentsPage() {
  const { company } = useCompanyPortal();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<CollectUkPayment[]>([]);

  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setPayments(await collectUkPayments.list(company.id));
      } catch (err) {
        setError(err instanceof FulfilmentApiError ? err.message : "Could not load payments right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, [company.id]);

  const copyLink = async (p: CollectUkPayment) => {
    if (!p.checkoutUrl) return;
    try {
      await navigator.clipboard.writeText(p.checkoutUrl);
      setCopiedId(p.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast({ title: "Couldn't copy — open the link and copy from the address bar", tone: "error" });
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !description.trim() || !amount) return;
    setCreating(true);
    setCreateError(null);
    try {
      const payment = await collectUkPayments.create(company.id, {
        customerName: customerName.trim(),
        customerContact: customerContact.trim() || undefined,
        description: description.trim(),
        amountPence: Math.round(Number(amount) * 100),
      });
      setPayments(prev => [payment, ...prev]);
      setCustomerName("");
      setCustomerContact("");
      setDescription("");
      setAmount("");
      if (payment.checkoutUrl) {
        await navigator.clipboard.writeText(payment.checkoutUrl).catch(() => {});
        setCopiedId(payment.id);
        setTimeout(() => setCopiedId(null), 3000);
      }
      toast({ title: "Payment link created and copied", tone: "success" });
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.code === "STRIPE_NOT_CONFIGURED") {
        setCreateError("Card payments aren't switched on yet. Add your Stripe keys to enable them.");
      } else {
        setCreateError(err instanceof FulfilmentApiError ? err.message : "Could not create the payment link.");
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="text-base font-semibold text-text">New payment link</h2>
        <p className="mt-1 text-sm text-muted">
          Create a Stripe link for a customer to pay by card, then send it over WhatsApp. It marks Paid automatically.
        </p>
        <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer name" required>
              {p => <Input {...p} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Full name" />}
            </Field>
            <Field label="Customer phone / email" hint="Optional — for your records">
              {p => <Input {...p} value={customerContact} onChange={e => setCustomerContact(e.target.value)} />}
            </Field>
          </div>
          <Field label="What's it for" required>
            {p => <Textarea {...p} value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. 1x Drum, 1x Double-Door Fridge to Harare" />}
          </Field>
          <Field label="Amount (£)" required>
            {p => <Input {...p} type="number" min="1" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />}
          </Field>
          {createError && <Alert tone="error">{createError}</Alert>}
          <Button type="submit" size="md" loading={creating} disabled={!customerName.trim() || !description.trim() || !amount}>
            Create payment link
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-text">Payments</h2>
        {loading && (
          <div className="mt-3 flex flex-col gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {!loading && error && <Alert tone="error">{error}</Alert>}
        {!loading && !error && payments.length === 0 && (
          <p className="mt-3 text-sm text-muted">No payments yet — create a link above.</p>
        )}
        {!loading && payments.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {payments.map(p => {
              const s = STATUS[p.status] ?? { label: p.status, tone: "neutral" as const };
              return (
                <li key={p.id} className="rounded-md border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-text">
                        {p.customerName} · <span className="tabular-nums">{money(p.amountPence)}</span>
                      </div>
                      <div className="truncate text-xs text-muted">{p.description}</div>
                    </div>
                    <StatusBadge label={s.label} tone={s.tone} />
                  </div>
                  {p.status === "PENDING" && p.checkoutUrl && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button type="button" size="md" variant="secondary" onClick={() => copyLink(p)}>
                        {copiedId === p.id ? "Link copied ✓" : "Copy link"}
                      </Button>
                      <a href={p.checkoutUrl} target="_blank" rel="noopener noreferrer">
                        <Button type="button" size="md" variant="ghost">
                          Open
                        </Button>
                      </a>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
