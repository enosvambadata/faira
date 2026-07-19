"use client";

import { useEffect, useState } from "react";
import { marketAccount, ApiError, type MarketSellerBalance } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Section } from "./Section";

export function EarningsSection() {
  const [balance, setBalance] = useState<MarketSellerBalance | null>(null);
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setBalance(await marketAccount.balance());
    } catch {
      /* leave null */
    }
  };

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const b = await marketAccount.balance();
        if (!ignore) setBalance(b);
      } catch {
        /* leave null */
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const available = balance?.availableBalance ?? 0;
  const minimum = balance?.minimumPayoutAmount ?? 0;
  const canPayout = available >= minimum && minimum > 0;

  const requestPayout = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setError("Enter an amount to withdraw.");
      return;
    }
    if (!details.trim()) {
      setError("Enter where to send the money (EcoCash number or bank details).");
      return;
    }
    setRequesting(true);
    setError(null);
    try {
      await marketAccount.requestPayout(amt, details.trim());
      setDone(true);
      setAmount("");
      setDetails("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't request the payout.");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Section title="Earnings">
      {!balance ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <>
          <div className="rounded-lg border border-border bg-light p-4">
            <p className="text-sm text-muted">Available to withdraw</p>
            <p className="text-3xl font-extrabold tracking-tight text-text">${available.toLocaleString()}</p>
            <p className="mt-1 text-xs text-muted">
              Released from escrow once buyers confirm delivery. Minimum payout ${minimum}.
            </p>
          </div>

          {done && <p className="text-sm text-green">Payout requested — we&rsquo;ll process it shortly.</p>}

          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                value={amount}
                onChange={e => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="Amount (USD)"
                className="h-11 w-36 rounded-md border border-border bg-white px-3.5 text-[15px] text-text outline-none focus:border-primary"
              />
              <input
                value={details}
                onChange={e => setDetails(e.target.value)}
                placeholder="EcoCash number or bank details"
                className="h-11 flex-1 rounded-md border border-border bg-white px-3.5 text-[15px] text-text outline-none focus:border-primary"
              />
            </div>
            {error && <p className="text-sm text-red">{error}</p>}
            <Button size="md" onClick={requestPayout} loading={requesting} disabled={requesting || !canPayout}>
              Request payout
            </Button>
            {!canPayout && available < minimum && (
              <p className="text-xs text-muted">You need at least ${minimum} available to request a payout.</p>
            )}
          </div>
        </>
      )}
    </Section>
  );
}
