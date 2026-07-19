"use client";

import { useEffect, useState } from "react";
import { marketAccount, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Section } from "./Section";

export function ProfileSection() {
  const [displayName, setDisplayName] = useState("");
  const [city, setCity] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const p = await marketAccount.profile();
        if (!ignore) {
          setDisplayName(p.displayName ?? "");
          setCity(p.city ?? "");
        }
      } catch {
        /* leave blank */
      } finally {
        if (!ignore) setLoaded(true);
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await marketAccount.updateProfile({ displayName: displayName.trim() || undefined, city: city.trim() || undefined });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your profile.");
    } finally {
      setSaving(false);
    }
  };

  const nameMissing = loaded && !displayName.trim();

  return (
    <Section title="Your profile">
      {!loaded ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <>
          {nameMissing && (
            <p className="rounded-md bg-primary-light px-3 py-2 text-sm text-primary-dark">
              Add a display name so buyers see who they&rsquo;re buying from.
            </p>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text">Display name</span>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              maxLength={60}
              placeholder="e.g. Morgan Auto Spares"
              className="h-11 rounded-md border border-border bg-white px-3.5 text-[15px] text-text outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text">City</span>
            <input
              value={city}
              onChange={e => setCity(e.target.value)}
              maxLength={60}
              placeholder="e.g. Harare"
              className="h-11 rounded-md border border-border bg-white px-3.5 text-[15px] text-text outline-none focus:border-primary"
            />
          </label>
          {error && <p className="text-sm text-red">{error}</p>}
          <div className="flex items-center gap-3">
            <Button size="md" onClick={save} loading={saving} disabled={saving}>Save profile</Button>
            {saved && <span className="text-sm text-green">Saved</span>}
          </div>
        </>
      )}
    </Section>
  );
}
