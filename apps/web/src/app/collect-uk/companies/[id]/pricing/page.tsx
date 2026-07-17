"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useCompanyPortal } from "@/lib/companyContext";
import { collectUkFreight, CollectUkFreightRate, FulfilmentApiError } from "@/lib/api";

const money = (pence: number) => `£${(pence / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toPence = (pounds: string) => Math.round(Number(pounds) * 100);
const toPounds = (pence: number) => (pence / 100).toString();

function groupByCategory(rates: CollectUkFreightRate[]): [string, CollectUkFreightRate[]][] {
  const map = new Map<string, CollectUkFreightRate[]>();
  for (const r of rates) {
    if (!map.has(r.category)) map.set(r.category, []);
    map.get(r.category)!.push(r);
  }
  return [...map.entries()];
}

export default function CompanyPricingPage() {
  const { company, isAdmin } = useCompanyPortal();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rates, setRates] = useState<CollectUkFreightRate[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [seeding, setSeeding] = useState(false);
  const [copied, setCopied] = useState(false);

  // Add-item form
  const [newCategory, setNewCategory] = useState("");
  const [newItem, setNewItem] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setRates(await collectUkFreight.list(company.id));
      } catch (err) {
        setError(err instanceof FulfilmentApiError ? err.message : "Could not load the rate card right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, [company.id]);

  const activeRates = useMemo(() => rates.filter(r => r.isActive), [rates]);
  const grouped = useMemo(() => groupByCategory(activeRates), [activeRates]);

  const selected = activeRates.filter(r => (qty[r.id] ?? 0) > 0);
  const totalPence = selected.reduce((s, r) => s + r.pricePence * (qty[r.id] ?? 0), 0);

  const setQuantity = (id: string, n: number) => setQty(prev => ({ ...prev, [id]: Math.max(0, n) }));

  const quoteText = useMemo(() => {
    const lines = selected.map(r => `${qty[r.id]}x ${r.itemName} — ${money(r.pricePence * qty[r.id])}`);
    return [`Shipping quote — ${company.name}`, ...lines, "", `Total: ${money(totalPence)}`].join("\n");
  }, [selected, qty, totalPence, company.name]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(quoteText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy — select and copy the total manually", tone: "error" });
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await collectUkFreight.seed(company.id);
      setRates(await collectUkFreight.list(company.id));
      toast({ title: "Standard UK → Zimbabwe rate card loaded", tone: "success" });
    } catch (err) {
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not load the rate card", tone: "error" });
    } finally {
      setSeeding(false);
    }
  };

  const handlePriceSave = async (rate: CollectUkFreightRate, pounds: string) => {
    const pence = toPence(pounds);
    if (!Number.isFinite(pence) || pence < 0 || pence === rate.pricePence) return;
    try {
      const updated = await collectUkFreight.update(company.id, rate.id, { pricePence: pence });
      setRates(prev => prev.map(r => (r.id === rate.id ? updated : r)));
    } catch (err) {
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not update price", tone: "error" });
    }
  };

  const handleDelete = async (rate: CollectUkFreightRate) => {
    try {
      await collectUkFreight.remove(company.id, rate.id);
      setRates(prev => prev.filter(r => r.id !== rate.id));
    } catch (err) {
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not remove item", tone: "error" });
    }
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim() || !newItem.trim() || !newPrice) return;
    setAdding(true);
    try {
      const created = await collectUkFreight.add(company.id, {
        category: newCategory.trim(),
        itemName: newItem.trim(),
        pricePence: toPence(newPrice),
        sortOrder: rates.length,
      });
      setRates(prev => [...prev, created]);
      setNewItem("");
      setNewPrice("");
      toast({ title: "Item added", tone: "success" });
    } catch (err) {
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not add item", tone: "error" });
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

  const categories = [...new Set(rates.map(r => r.category))];

  return (
    <div className="flex flex-col gap-4">
      {rates.length === 0 ? (
        <Card>
          <h2 className="text-base font-semibold text-text">No price list yet</h2>
          <p className="mt-1 text-sm text-muted">
            Set up what you charge customers to ship each item. Start from the standard UK → Zimbabwe rate card, then edit
            anything.
          </p>
          {isAdmin ? (
            <Button type="button" size="md" className="mt-4" loading={seeding} onClick={handleSeed}>
              Load standard UK → Zimbabwe rate card
            </Button>
          ) : (
            <p className="mt-3 text-sm text-muted">Ask a company admin to set up the price list.</p>
          )}
        </Card>
      ) : (
        <>
          {/* Quote calculator */}
          <Card>
            <h2 className="text-base font-semibold text-text">Quote a customer</h2>
            <p className="mt-1 text-sm text-muted">Add their items to build a quote, then copy it to WhatsApp.</p>

            <div className="mt-4 flex flex-col gap-5">
              {grouped.map(([category, items]) => (
                <div key={category}>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">{category}</p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {items.map(r => {
                      const n = qty[r.id] ?? 0;
                      return (
                        <li key={r.id} className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-sm text-text">
                            {r.itemName} <span className="text-muted">· {money(r.pricePence)}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              aria-label={`Remove one ${r.itemName}`}
                              onClick={() => setQuantity(r.id, n - 1)}
                              disabled={n === 0}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted disabled:opacity-40"
                            >
                              −
                            </button>
                            <span className="w-5 text-center text-sm tabular-nums text-text">{n}</span>
                            <button
                              type="button"
                              aria-label={`Add one ${r.itemName}`}
                              onClick={() => setQuantity(r.id, n + 1)}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-primary text-primary"
                            >
                              +
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <div className="text-sm text-muted">
                {selected.length === 0 ? "No items selected" : `${selected.reduce((s, r) => s + qty[r.id], 0)} item(s)`}
                <span className="ml-3 text-lg font-semibold text-text">{money(totalPence)}</span>
              </div>
              <div className="flex gap-2">
                {selected.length > 0 && (
                  <Button type="button" size="md" variant="ghost" onClick={() => setQty({})}>
                    Clear
                  </Button>
                )}
                <Button type="button" size="md" disabled={selected.length === 0} onClick={handleCopy}>
                  {copied ? "Copied ✓" : "Copy quote"}
                </Button>
              </div>
            </div>
          </Card>

          {/* Manage prices (admin) */}
          {isAdmin && (
            <Card>
              <h2 className="text-base font-semibold text-text">Manage prices</h2>
              <p className="mt-1 text-sm text-muted">Edit a price and tab out to save. Changes only affect future quotes.</p>

              <div className="mt-4 flex flex-col gap-4">
                {groupByCategory(rates).map(([category, items]) => (
                  <div key={category}>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">{category}</p>
                    <ul className="mt-2 flex flex-col gap-2">
                      {items.map(r => (
                        <li key={r.id} className="flex items-center gap-2">
                          <span className="flex-1 truncate text-sm text-text">{r.itemName}</span>
                          <span className="flex items-center gap-1 text-sm text-muted">£</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            defaultValue={toPounds(r.pricePence)}
                            onBlur={e => handlePriceSave(r, e.target.value)}
                            className="w-24 rounded-md border border-border bg-white px-2 py-1.5 text-right text-sm text-text focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          />
                          <button
                            type="button"
                            onClick={() => handleDelete(r)}
                            className="text-xs font-medium text-red hover:underline"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAdd} className="mt-5 flex flex-col gap-3 border-t border-border pt-4">
                <h3 className="text-sm font-medium text-text">Add an item</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Category" required>
                    {p => (
                      <Input
                        {...p}
                        list="freight-categories"
                        value={newCategory}
                        onChange={e => setNewCategory(e.target.value)}
                        placeholder="e.g. Fridges"
                      />
                    )}
                  </Field>
                  <Field label="Item" required>
                    {p => <Input {...p} value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="e.g. Chest Freezer" />}
                  </Field>
                  <Field label="Price (£)" required>
                    {p => <Input {...p} type="number" min="0" step="1" value={newPrice} onChange={e => setNewPrice(e.target.value)} />}
                  </Field>
                </div>
                <datalist id="freight-categories">
                  {categories.map(c => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <Button type="submit" size="md" variant="secondary" loading={adding} disabled={!newCategory.trim() || !newItem.trim() || !newPrice}>
                  Add item
                </Button>
              </form>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
