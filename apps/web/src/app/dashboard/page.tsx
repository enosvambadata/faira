"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Package, CheckCircle, Clock } from "@/components/ui/icons";
import { sellerOnboarding, sellerVerification, hubs as hubsApi, OnboardingDraft, VerificationStatusResult, Hub } from "@/lib/api";

const VERIFICATION_TONE: Record<VerificationStatusResult["status"], "neutral" | "info" | "success" | "error" | "warning"> = {
  NOT_STARTED: "neutral",
  IN_PROGRESS: "info",
  SUBMITTED: "info",
  UNDER_REVIEW: "info",
  MORE_INFO_REQUIRED: "warning",
  APPROVED: "success",
  REJECTED: "error",
  SUSPENDED: "error",
  EXPIRED: "warning",
};

const VERIFICATION_LABEL: Record<VerificationStatusResult["status"], string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  MORE_INFO_REQUIRED: "More info needed",
  APPROVED: "Verified",
  REJECTED: "Rejected",
  SUSPENDED: "Suspended",
  EXPIRED: "Expired",
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [verification, setVerification] = useState<VerificationStatusResult | null>(null);
  const [preferredHub, setPreferredHub] = useState<Hub | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [onboarding, verificationStatus, hubList] = await Promise.all([
          sellerOnboarding.getDraft(),
          sellerVerification.getStatus(),
          hubsApi.list(),
        ]);
        setDraft(onboarding);
        setVerification(verificationStatus);
        setPreferredHub(hubList.find(h => h.id === onboarding.preferredHubId) ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-8 w-56" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </AppShell>
    );
  }

  const registrationComplete = draft?.status === "SUBMITTED";
  const verified = verification?.status === "APPROVED";
  const canCreateShipment = registrationComplete && verified;

  return (
    <AppShell>
      <h1 className="text-xl font-semibold text-text">Welcome{draft?.fullName ? `, ${draft.fullName.split(" ")[0]}` : ""}</h1>
      <p className="mt-1 text-sm text-muted">Here&apos;s the state of your Faira Fulfilment account.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text">Registration</span>
            <StatusBadge label={registrationComplete ? "Complete" : "Incomplete"} tone={registrationComplete ? "success" : "warning"} />
          </div>
          {!registrationComplete && (
            <Link href="/onboarding">
              <Button size="md" variant="secondary" className="mt-3">
                Finish registration
              </Button>
            </Link>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text">Verification</span>
            {verification && <StatusBadge label={VERIFICATION_LABEL[verification.status]} tone={VERIFICATION_TONE[verification.status]} />}
          </div>
          {!verified && (
            <Link href="/verification">
              <Button size="md" variant="secondary" className="mt-3">
                {verification?.status === "NOT_STARTED" ? "Start verification" : "View verification"}
              </Button>
            </Link>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text">Preferred hub</span>
        </div>
        <p className="mt-1 text-[15px] text-text">{preferredHub ? `${preferredHub.name} — ${preferredHub.city}` : "Not set yet"}</p>
        {preferredHub && <p className="text-sm text-muted">{preferredHub.openingHours}</p>}
      </Card>

      <div className="mt-6">
        {canCreateShipment ? (
          <Link href="/shipments/new">
            <Button size="lg" fullWidth>
              <Package size={18} />
              Create a shipment
            </Button>
          </Link>
        ) : (
          <Card className="flex items-center gap-3 bg-primary-light">
            <Clock size={20} className="shrink-0 text-primary" />
            <p className="text-sm text-primary-dark">
              {!registrationComplete
                ? "Finish your registration to unlock shipment creation."
                : "Get verified to start creating shipments."}
            </p>
          </Card>
        )}
      </div>

      <h2 className="mt-8 text-lg font-semibold text-text">Recent shipments</h2>
      <div className="mt-3">
        <EmptyState
          icon={<Package size={28} />}
          title="No shipments yet"
          description="Once you're verified, shipments you create will show up here."
        />
      </div>

      {verified && (
        <div className="mt-4">
          <Card className="flex items-center gap-3">
            <CheckCircle size={20} className="text-green" />
            <p className="text-sm text-text">You&apos;re verified and ready to ship with Faira Fulfilment.</p>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
