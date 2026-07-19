"use client";

import { useEffect, useState } from "react";
import { marketAccount, uploadListingImage, ApiError, type MarketVerification } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Section } from "./Section";

function FilePick({ label, file, onPick }: { label: string; file: File | null; onPick: (f: File | null) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-dashed border-border bg-white px-3.5 py-3 text-sm">
      <span className="text-muted">{file ? file.name : label}</span>
      <span className="rounded-md bg-primary-light px-2.5 py-1 text-xs font-medium text-primary-dark">{file ? "Change" : "Choose"}</span>
      <input type="file" accept="image/*" className="hidden" onChange={e => onPick(e.target.files?.[0] ?? null)} />
    </label>
  );
}

export function VerificationSection() {
  const [status, setStatus] = useState<MarketVerification | null | undefined>(undefined); // undefined = loading
  const [idDoc, setIdDoc] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const v = await marketAccount.verification();
        if (!ignore) setStatus(v);
      } catch {
        if (!ignore) setStatus(null);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const submit = async () => {
    if (!idDoc || !selfie) {
      setError("Add both your ID document and a selfie.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const [sig1, sig2] = await Promise.all([marketAccount.verificationUploadSignature(), marketAccount.verificationUploadSignature()]);
      const [idUrl, selfieUrl] = await Promise.all([uploadListingImage(sig1, idDoc), uploadListingImage(sig2, selfie)]);
      const v = await marketAccount.submitVerification(idUrl, selfieUrl);
      setStatus(v);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't submit your verification.");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === undefined) {
    return (
      <Section title="Verification">
        <Skeleton className="h-16 w-full" />
      </Section>
    );
  }

  if (status?.status === "APPROVED") {
    return (
      <Section title="Verification">
        <p className="flex items-center gap-2 text-sm font-medium text-green">✓ You&rsquo;re a verified seller — buyers see the badge on your listings.</p>
      </Section>
    );
  }

  if (status?.status === "PENDING") {
    return (
      <Section title="Verification">
        <p className="text-sm text-muted">Your documents are under review. We&rsquo;ll add the Verified badge once approved.</p>
      </Section>
    );
  }

  return (
    <Section title="Get verified">
      <p className="text-sm text-muted">
        Verified sellers get a ✓ badge that buyers trust. Upload a photo of your ID and a selfie — we review it manually.
      </p>
      {status?.status === "REJECTED" && status.rejectionReason && (
        <p className="rounded-md bg-red/10 px-3 py-2 text-sm text-red">Previous submission rejected: {status.rejectionReason}</p>
      )}
      <FilePick label="ID document (photo)" file={idDoc} onPick={setIdDoc} />
      <FilePick label="Selfie" file={selfie} onPick={setSelfie} />
      {error && <p className="text-sm text-red">{error}</p>}
      <Button size="md" onClick={submit} loading={submitting} disabled={submitting || !idDoc || !selfie}>
        Submit for verification
      </Button>
    </Section>
  );
}
