"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { CollectBrand } from "@/components/collect-uk/CollectBrand";
import { getDispatchToken, setDispatchToken, clearDispatchToken } from "@/lib/dispatchToken";
import { DispatchContext } from "@/lib/dispatchContext";
import { collectUkDispatch, FulfilmentApiError } from "@/lib/api";

const TABS = [
  { href: "/collect-uk/dispatch", label: "Queue", exact: true },
  { href: "/collect-uk/dispatch/routes", label: "Routes", exact: false },
  { href: "/collect-uk/dispatch/drivers", label: "Drivers", exact: false },
  { href: "/collect-uk/dispatch/companies", label: "Companies", exact: false },
];

// One gate for the whole dispatch area: unlock once with the ADMIN_TOKEN,
// then every tab shares the session. Pages get the token (and the 401
// handler) from DispatchContext instead of reimplementing auth.
export default function DispatchLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenChecking, setTokenChecking] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    setToken(getDispatchToken());
    setReady(true);
  }, []);

  const lock = () => {
    clearDispatchToken();
    setToken(null);
  };

  const authFailure = () => {
    clearDispatchToken();
    setToken(null);
    setTokenError("That admin token was rejected. Please enter it again.");
  };

  const handleTokenSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const candidate = tokenInput.trim();
    if (!candidate) return;
    setTokenChecking(true);
    setTokenError(null);
    try {
      await collectUkDispatch.listDrivers(candidate); // cheap auth probe
      setDispatchToken(candidate);
      setToken(candidate);
      setTokenInput("");
    } catch (err) {
      setTokenError(
        err instanceof FulfilmentApiError && err.status === 401
          ? "That token was rejected — check it and try again."
          : "Could not verify the token right now.",
      );
    } finally {
      setTokenChecking(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-3">
          <CollectBrand suffix="Dispatch" />
          {token && (
            <Button type="button" variant="ghost" size="md" onClick={lock}>
              Lock
            </Button>
          )}
        </div>
        {token && (
          <nav aria-label="Dispatch sections" className="mx-auto flex w-full max-w-3xl gap-1 px-4 sm:px-6">
            {TABS.map(tab => {
              const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`cursor-pointer border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                    active ? "border-primary text-primary" : "border-transparent text-muted hover:text-text"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        {ready && !token && (
          <Card className="mx-auto max-w-md">
            <h1 className="text-lg font-semibold text-text">Faira dispatch</h1>
            <p className="mt-1 text-sm text-muted">
              Internal tool for scheduling collections across every company. Enter the Faira admin token to
              continue — it stays in this tab only.
            </p>
            <form onSubmit={handleTokenSubmit} className="mt-4 flex flex-col gap-4">
              <Field label="Admin token" required>
                {p => <Input {...p} type="password" value={tokenInput} onChange={e => setTokenInput(e.target.value)} />}
              </Field>
              {tokenError && <Alert tone="error">{tokenError}</Alert>}
              <Button type="submit" size="md" loading={tokenChecking} disabled={!tokenInput.trim()}>
                Unlock dispatch
              </Button>
            </form>
          </Card>
        )}

        {token && <DispatchContext.Provider value={{ token, lock, authFailure }}>{children}</DispatchContext.Provider>}
      </main>
    </div>
  );
}
