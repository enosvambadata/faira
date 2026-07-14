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
import { collectUkDriverPortal, uploadDriverDocument, FulfilmentApiError } from "@/lib/api";

// Driver-level documents: one licence and one of each insurance certificate
// (which may be fleet policies covering all the driver's vehicles).
const DOCS = [
  { key: "drivingLicenceUrl" as const, label: "Driving licence", hint: "Both sides, or a clear photo of the photocard" },
  {
    key: "motorInsuranceUrl" as const,
    label: "Commercial vehicle insurance (hire & reward)",
    hint: "Must show hire & reward / courier use — personal cover isn't valid for paid collections",
  },
  { key: "gitInsuranceUrl" as const, label: "Goods in Transit insurance", hint: "Covers the parcels you carry" },
  { key: "liabilityUrl" as const, label: "Public liability insurance", hint: "Covers injury/damage while collecting" },
];

type DocKey = (typeof DOCS)[number]["key"];

interface VehicleForm {
  makeModel: string;
  registrationPlate: string;
  capacityParcels: string;
  photoUrl: string | null;
  photoState: UploadState;
}

const emptyVehicle = (): VehicleForm => ({
  makeModel: "",
  registrationPlate: "",
  capacityParcels: "",
  photoUrl: null,
  photoState: "idle",
});

export default function DriveForFairaPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [basePostcode, setBasePostcode] = useState("");
  const [county, setCounty] = useState("");
  const [docs, setDocs] = useState<Record<DocKey, string | null>>({
    drivingLicenceUrl: null,
    motorInsuranceUrl: null,
    gitInsuranceUrl: null,
    liabilityUrl: null,
  });
  const [docStates, setDocStates] = useState<Record<DocKey, UploadState>>({
    drivingLicenceUrl: "idle",
    motorInsuranceUrl: "idle",
    gitInsuranceUrl: "idle",
    liabilityUrl: "idle",
  });
  const [vehicles, setVehicles] = useState<VehicleForm[]>([emptyVehicle()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDocUpload = async (key: DocKey, file: File) => {
    setDocStates(prev => ({ ...prev, [key]: "uploading" }));
    setError(null);
    try {
      const params = await collectUkDriverPortal.getApplyUploadParams();
      const publicId = await uploadDriverDocument(params, file);
      setDocs(prev => ({ ...prev, [key]: publicId }));
      setDocStates(prev => ({ ...prev, [key]: "success" }));
    } catch (err) {
      setDocStates(prev => ({ ...prev, [key]: "error" }));
      setError(err instanceof FulfilmentApiError ? err.message : "Could not upload that document — try again.");
    }
  };

  const setVehicle = (i: number, patch: Partial<VehicleForm>) =>
    setVehicles(prev => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));

  const handleVehiclePhoto = async (i: number, file: File) => {
    setVehicle(i, { photoState: "uploading" });
    setError(null);
    try {
      const params = await collectUkDriverPortal.getApplyUploadParams();
      const publicId = await uploadDriverDocument(params, file);
      setVehicle(i, { photoUrl: publicId, photoState: "success" });
    } catch (err) {
      setVehicle(i, { photoState: "error" });
      setError(err instanceof FulfilmentApiError ? err.message : "Could not upload that photo — try again.");
    }
  };

  const allDocsUploaded = DOCS.every(d => docs[d.key]);
  const vehiclesValid = vehicles.every(v => v.makeModel.trim() && v.registrationPlate.trim() && v.photoUrl);
  const canSubmit =
    fullName.trim() && phone.trim() && basePostcode.trim() && county.trim() && allDocsUploaded && vehiclesValid;

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
        drivingLicenceUrl: docs.drivingLicenceUrl!,
        motorInsuranceUrl: docs.motorInsuranceUrl!,
        gitInsuranceUrl: docs.gitInsuranceUrl!,
        liabilityUrl: docs.liabilityUrl!,
        vehicles: vehicles.map(v => ({
          makeModel: v.makeModel.trim(),
          registrationPlate: v.registrationPlate.trim(),
          capacityParcels: v.capacityParcels ? Number.parseInt(v.capacityParcels, 10) : undefined,
          photoUrl: v.photoUrl!,
        })),
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
          Got your own van? Faira sends you paid collection routes in your area. We review your
          documents before your first route; a valid driving licence and commercial (hire &amp;
          reward), Goods in Transit and public liability cover are required by law for carrying
          customers&rsquo; goods.
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

            <div className="mt-2 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text">Your vehicles</h2>
                <Button type="button" variant="ghost" size="md" onClick={() => setVehicles(prev => [...prev, emptyVehicle()])}>
                  + Add another vehicle
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted">Register every van you might use for collections.</p>

              <div className="mt-3 flex flex-col gap-4">
                {vehicles.map((v, i) => (
                  <div key={i} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-text">Vehicle {i + 1}</p>
                      {vehicles.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="md"
                          onClick={() => setVehicles(prev => prev.filter((_, idx) => idx !== i))}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="Make & model" required>
                        {p => <Input {...p} value={v.makeModel} onChange={e => setVehicle(i, { makeModel: e.target.value })} placeholder="Ford Transit LWB" />}
                      </Field>
                      <Field label="Registration plate" required>
                        {p => <Input {...p} value={v.registrationPlate} onChange={e => setVehicle(i, { registrationPlate: e.target.value })} placeholder="AB12 CDE" />}
                      </Field>
                      <Field label="Parcel capacity" hint="Roughly how many parcels it holds">
                        {p => <Input {...p} type="number" min={1} value={v.capacityParcels} onChange={e => setVehicle(i, { capacityParcels: e.target.value })} placeholder="20" />}
                      </Field>
                    </div>
                    <div className="mt-3">
                      <FileUpload
                        label="Photo of this van"
                        hint="A clear photo of the vehicle"
                        accept="image/*,.pdf"
                        state={v.photoState}
                        onSelect={file => handleVehiclePhoto(i, file)}
                        onRetry={() => setVehicle(i, { photoState: "idle" })}
                        onRemove={() => setVehicle(i, { photoUrl: null, photoState: "idle" })}
                      />
                    </div>
                  </div>
                ))}
              </div>
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
