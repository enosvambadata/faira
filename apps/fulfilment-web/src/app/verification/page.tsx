"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { FileUpload, UploadState } from "@/components/ui/FileUpload";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import {
  sellerOnboarding,
  sellerVerification,
  OnboardingDraft,
  VerificationStatusResult,
  VerificationDocType,
} from "@/lib/api";

const STATUS_COPY: Record<VerificationStatusResult["status"], { label: string; tone: "neutral" | "info" | "success" | "error" | "warning"; description: string }> = {
  NOT_STARTED: {
    label: "Not started",
    tone: "neutral",
    description: "We verify every seller's identity to keep buyers and Faira hubs safe. Upload your documents to get started.",
  },
  IN_PROGRESS: {
    label: "In progress",
    tone: "info",
    description: "Finish uploading your documents and submit for review.",
  },
  SUBMITTED: {
    label: "Submitted",
    tone: "info",
    description: "We've received your documents. A member of our team will review them shortly.",
  },
  UNDER_REVIEW: {
    label: "Under review",
    tone: "info",
    description: "Your documents are being reviewed. This usually takes 1-2 business days.",
  },
  MORE_INFO_REQUIRED: {
    label: "More information required",
    tone: "warning",
    description: "We need a bit more information before we can approve your account. See the notes below and resubmit.",
  },
  APPROVED: {
    label: "Approved",
    tone: "success",
    description: "You're verified! You can now create shipments from Faira hubs.",
  },
  REJECTED: {
    label: "Rejected",
    tone: "error",
    description: "Your verification wasn't approved. See the notes below — you can correct the issue and resubmit.",
  },
  SUSPENDED: {
    label: "Suspended",
    tone: "error",
    description: "Your seller account has been suspended. Contact support for details.",
  },
  EXPIRED: {
    label: "Expired",
    tone: "warning",
    description: "Your verification has expired. Please resubmit your documents.",
  },
};

const CAN_SUBMIT_STATUSES: VerificationStatusResult["status"][] = ["NOT_STARTED", "IN_PROGRESS", "MORE_INFO_REQUIRED", "REJECTED", "EXPIRED"];

interface DocState {
  file: File | null;
  path: string | null;
  previewUrl: string | null;
  state: UploadState;
  error: string | null;
}

const EMPTY_DOC: DocState = { file: null, path: null, previewUrl: null, state: "idle", error: null };

export default function VerificationPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [verification, setVerification] = useState<VerificationStatusResult | null>(null);
  const [docs, setDocs] = useState<Record<VerificationDocType, DocState>>({
    ID: EMPTY_DOC,
    BUSINESS: EMPTY_DOC,
    SHOP_PHOTO: EMPTY_DOC,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [onboarding, status] = await Promise.all([sellerOnboarding.getDraft(), sellerVerification.getStatus()]);
      setDraft(onboarding);
      setVerification(status);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSelect = async (docType: VerificationDocType, file: File) => {
    setDocs(prev => ({ ...prev, [docType]: { file, path: null, previewUrl: URL.createObjectURL(file), state: "uploading", error: null } }));
    try {
      const upload = await sellerVerification.getUploadUrl(docType);
      await sellerVerification.uploadFile(upload, file);
      setDocs(prev => ({ ...prev, [docType]: { ...prev[docType], path: upload.path, state: "success" } }));
    } catch (err) {
      setDocs(prev => ({
        ...prev,
        [docType]: { ...prev[docType], state: "error", error: err instanceof Error ? err.message : "Upload failed" },
      }));
    }
  };

  const handleRetry = (docType: VerificationDocType) => {
    const doc = docs[docType];
    if (doc.file) handleSelect(docType, doc.file);
  };

  const handleRemove = (docType: VerificationDocType) => {
    setDocs(prev => ({ ...prev, [docType]: EMPTY_DOC }));
  };

  const needsBusinessDoc = draft?.sellerType === "REGISTERED_BUSINESS";
  const needsShopPhoto = draft?.hasPhysicalShop === true;
  const idReady = docs.ID.state === "success";
  const businessReady = !needsBusinessDoc || docs.BUSINESS.state === "success";
  const shopPhotoReady = !needsShopPhoto || docs.SHOP_PHOTO.state === "success";
  const canSubmit = idReady && businessReady && shopPhotoReady;

  const handleSubmit = async () => {
    if (!canSubmit || !docs.ID.path) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await sellerVerification.submit({
        idDocumentPath: docs.ID.path,
        businessDocumentPath: docs.BUSINESS.path ?? undefined,
        shopPhotoPath: docs.SHOP_PHOTO.path ?? undefined,
      });
      setVerification(result);
      toast({ title: "Verification submitted", description: "We'll review your documents shortly.", tone: "success" });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not submit for verification right now");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-80 w-full" />
        </div>
      </AppShell>
    );
  }

  if (!verification) {
    return (
      <AppShell>
        <Alert tone="error">Could not load your verification status. Try reloading the page.</Alert>
      </AppShell>
    );
  }

  const statusInfo = STATUS_COPY[verification.status];
  const canSubmitNow = CAN_SUBMIT_STATUSES.includes(verification.status);

  return (
    <AppShell>
      <div className="mx-auto max-w-xl">
        <h1 className="text-xl font-semibold text-text">Seller verification</h1>
        <p className="mt-1 text-sm text-muted">We verify every seller to keep the Faira Fulfilment network trustworthy.</p>

        <Card className="mt-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text">Status</span>
            <StatusBadge label={statusInfo.label} tone={statusInfo.tone} />
          </div>
          <p className="mt-2 text-sm text-muted">{statusInfo.description}</p>
          {verification.reviewNotes && (verification.status === "MORE_INFO_REQUIRED" || verification.status === "REJECTED") && (
            <div className="mt-3">
              <Alert tone="warning">{verification.reviewNotes}</Alert>
            </div>
          )}
        </Card>

        {canSubmitNow && (
          <Card className="mt-4 flex flex-col gap-5">
            <FileUpload
              label="Government-issued ID"
              hint="A clear photo or scan of your National ID or passport"
              state={docs.ID.state}
              previewUrl={docs.ID.state === "success" ? docs.ID.previewUrl : verification.idDocumentUrl}
              fileName={docs.ID.file?.name}
              error={docs.ID.error}
              onSelect={file => handleSelect("ID", file)}
              onRetry={() => handleRetry("ID")}
              onRemove={() => handleRemove("ID")}
            />

            {needsBusinessDoc && (
              <FileUpload
                label="Business registration document"
                hint="Certificate of incorporation or business registration"
                state={docs.BUSINESS.state}
                previewUrl={docs.BUSINESS.state === "success" ? docs.BUSINESS.previewUrl : verification.businessDocumentUrl}
                fileName={docs.BUSINESS.file?.name}
                error={docs.BUSINESS.error}
                onSelect={file => handleSelect("BUSINESS", file)}
                onRetry={() => handleRetry("BUSINESS")}
                onRemove={() => handleRemove("BUSINESS")}
              />
            )}

            {needsShopPhoto && (
              <FileUpload
                label="Photo of your shop"
                hint="A clear photo of your shop front or trading location"
                state={docs.SHOP_PHOTO.state}
                previewUrl={docs.SHOP_PHOTO.state === "success" ? docs.SHOP_PHOTO.previewUrl : verification.shopPhotoUrl}
                fileName={docs.SHOP_PHOTO.file?.name}
                error={docs.SHOP_PHOTO.error}
                onSelect={file => handleSelect("SHOP_PHOTO", file)}
                onRetry={() => handleRetry("SHOP_PHOTO")}
                onRemove={() => handleRemove("SHOP_PHOTO")}
              />
            )}

            {submitError && <Alert tone="error">{submitError}</Alert>}

            <Button onClick={handleSubmit} disabled={!canSubmit} loading={submitting} size="lg">
              Submit for verification
            </Button>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
