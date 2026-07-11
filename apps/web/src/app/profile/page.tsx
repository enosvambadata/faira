"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { sellerOnboarding, OnboardingDraft } from "@/lib/api";
import { createClient } from "@/lib/supabase";

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [{ data }, onboarding] = await Promise.all([supabase.auth.getUser(), sellerOnboarding.getDraft()]);
      setEmail(data.user?.email ?? null);
      setDraft(onboarding);
      setLoading(false);
    })();
  }, []);

  return (
    <AppShell>
      <h1 className="text-xl font-semibold text-text">Profile</h1>

      {loading ? (
        <Skeleton className="mt-6 h-48 w-full max-w-md" />
      ) : (
        <Card className="mt-6 max-w-md">
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Full name</dt>
              <dd className="text-text">{draft?.fullName ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Email</dt>
              <dd className="text-text">{email ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Mobile number</dt>
              <dd className="text-text">{draft?.mobileNumber ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Selling as</dt>
              <dd className="text-text">
                {draft?.sellerType === "REGISTERED_BUSINESS" ? draft.businessName || "Registered business" : "Individual"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">City</dt>
              <dd className="text-text">{draft?.city ?? "—"}</dd>
            </div>
          </dl>
        </Card>
      )}
    </AppShell>
  );
}
