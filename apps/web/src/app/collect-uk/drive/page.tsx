"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FileUpload, UploadState } from "@/components/ui/FileUpload";
import { CollectBrand } from "@/components/collect-uk/CollectBrand";
import { collectUkDriverPortal, uploadParcelEvidencePhoto, FulfilmentApiError } from "@/lib/api";

const DOCS = [
  {
    key: "vanPhotoUrl" as const,
    label: "Photo of your van",
    hint: "A clear photo of the vehicle you'll collect with",
  },
  {
    key: "motorInsuranceUrl" as const,
    label: "Commercial vehicle insurance (hire & reward)",
    hint: "Your certificate must show hire & reward / courier use — personal cover isn't valid for paid collections",
  },
  {
    key: "gitInsuranceUrl" as const,
    label: "Goods in Transit insurance",
    hint: "Covers the parcels you carry — required before your first route",
  },
  {
    key: "liabilityUrl" as const,
    label: "Public liability insurance",
    hint: "Covers injury/damage while collecting at customers' doors",
  },
];

type DocKey = (typeof DOCS)[number]["key"];

export default function DriveForFairaPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [basePostcode, setBasePostcode] = useState("");
  const [county, setCounty] = useState("");
  const [vehicleMakeModel, setVehicleMakeModel] = useState("");
  const [vehicleReference, setVehicleReference] = useState("");
  const [docs, setDocs] = useState<Record<DocKey, string | null>>({
    vanPhotoUrl: null,
    motorInsuranceUrl: null,
    gitInsuranceUrl: null,
    liabilityUrl: null,
  });
  const [docStates, setDocStates] = useState<Record<DocKey, UploadState>>({
    vanPhotoUrl: "idle",
    motorInsuranceUrl: "idle",
    gitInsuranceUrl: "idle",
    liabilityUrl: "idle",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDocUpload = async (key: DocKey, file: File) => {
    setDocStates(prev => ({ ...prev, [key]: "uploading" }));
    setError(null);
    try {
      const params = await collectUkDriverPortal.getApplyUploadParams();
      const publicId = await uploadParcelEvidencePhoto(params, file);
      setDocs(prev => ({ ...prev, [key]: publicId }));
      setDocStates(prev => ({ ...prev, [key]: "success" }));
    } catch (err) {
      setDocStates(prev => ({ ...prev, [key]: "error" }));
      setError(err instanceof FulfilmentApiError ? err.message : "Could not upload that document — try again.");
    }
  };

  const allDocsUploaded = DOCS.every(d => docs[d.key]);
  const canSubmit =
    fullName.trim() && phone.trim() && basePostcode.trim() && county.trim() && vehicleMakeModel.trim() &&
    vehicleReference.trim() && allDocsUploaded;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await collectUkDriverPortal.apply({
        fullName: fullName.trim(),
        phone: phone.trim(),
        basePostcode: basePostcode.trim(),
        county: county.trim(),
        vehicleMakeModel: vehicleMakeModel.trim(),
        vehicleReference: vehicleReference.trim(),
        vanPhotoUrl: docs.vanPhotoUrl!,
        motorInsuranceUrl: docs.motorInsuranceUrl!,
        gitInsuranceUrl: docs.gitInsuranceUrl!,
        liabilityUrl: docs.liabilityUrl!,
      });
      router.push("/collect-uk/driver");
    } catch (err) {
      setError(
        err instanceof FulfilmentApiError && err.code === "ALREADY_APPLIED"
          ? "You already have a driver record — check your status on the driver page."
          : err instanceof FulfilmentApiError
            ? err.message
            : "Could not submit your application right now.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3.5">
          <CollectBrand suffix="Drive" />
          <Link
            href="/collect-uk/driver"
            className="cursor-pointer text-sm font-medium text-muted transition-colors duration-200 hover:text-primary"
          >
            Driver portal
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="text-xl font-semibold text-text">Drive for Faira</h1>
        <p className="mt-1 text-sm text-muted">
          Got your own van? Faira sends you paid collection routes in your area — you collect from
          customers&rsquo; doors and deliver to one warehouse. We review your documents before your
          first route; commercial (hire &amp; reward) insurance, Goods in Transit and public
          liability cover are required by law for carrying customers&rsquo; goods.
        </p>

        <Card className="mt-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Full name" required>
              {p => <Input {...p} value={fullName} onChange={e => setFullName(e.target.value)} />}
            </Field>
            <Field label="Phone number" required>
              {p => <Input {...p} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+44 7700 900000" />}
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Base postcode" hint="Where your routes should start" required>
                {p => <Input {...p} value={basePostcode} onChange={e => setBasePostcode(e.target.value)} placeholder="M1 1AE" />}
              </Field>
              <Field label="County" required>
                {p => <Input {...p} value={county} onChange={e => setCounty(e.target.value)} placeholder="Greater Manchester" />}
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Van make & model" required>
                {p => <Input {...p} value={vehicleMakeModel} onChange={e => setVehicleMakeModel(e.target.value)} placeholder="Ford Transit LWB" />}
              </Field>
              <Field label="Registration plate" required>
                {p => <Input {...p} value={vehicleReference} onChange={e => setVehicleReference(e.target.value)} placeholder="AB12 CDE" />}
              </Field>
            </div>

            <div className="mt-2 border-t border-border pt-4">
              <h2 className="text-sm font-semibold text-text">Your documents</h2>
              <p className="mt-1 text-xs text-muted">
                Photos or scans are fine. Stored securely and only visible to Faira&rsquo;s review team.
              </p>
              <div className="mt-3 flex flex-col gap-4">
                {DOCS.map(doc => (
                  <div key={doc.key}>
                    <FileUpload
                      label={doc.label}
                      hint={doc.hint}
                      accept="image/*,.pdf"
                      state={docStates[doc.key]}
                      onSelect={file => handleDocUpload(doc.key, file)}
                      onRetry={() => setDocStates(prev => ({ ...prev, [doc.key]: "idle" }))}
                      onRemove={() => {
                        setDocs(prev => ({ ...prev, [doc.key]: null }));
                        setDocStates(prev => ({ ...prev, [doc.key]: "idle" }));
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {error && <Alert tone="error">{error}</Alert>}

            <Button type="submit" size="lg" loading={submitting} disabled={!canSubmit}>
              Submit application
            </Button>
            <p className="text-center text-xs text-muted">
              By applying you agree to our{" "}
              <a href="/privacy" target="_blank" className="cursor-pointer underline">
                privacy notice
              </a>
              .
            </p>
          </form>
        </Card>
      </main>
    </div>
  );
}
