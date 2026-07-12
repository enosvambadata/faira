"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { Package, CheckCircle, MessageSquare, Truck } from "@/components/ui/icons";
import {
  collectUkBookings,
  CollectUkBookingCompany,
  BookingConfirmation,
  ParcelSizeTier,
  FulfilmentApiError,
} from "@/lib/api";

const SIZE_OPTIONS: { value: ParcelSizeTier; label: string }[] = [
  { value: "SMALL", label: "Small (shoebox)" },
  { value: "MEDIUM", label: "Medium (microwave)" },
  { value: "LARGE", label: "Large (suitcase)" },
  { value: "EXTRA_LARGE", label: "Extra large" },
];

export default function BookCollectionPage() {
  const { slug } = useParams<{ slug: string }>();

  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<CollectUkBookingCompany | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [destinationCountry, setDestinationCountry] = useState<string | undefined>(undefined);
  const [collectionAddress, setCollectionAddress] = useState("");
  const [collectionPostcode, setCollectionPostcode] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [parcelSizeTier, setParcelSizeTier] = useState<ParcelSizeTier | undefined>(undefined);
  const [numberOfParcels, setNumberOfParcels] = useState("1");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setCompany(await collectUkBookings.getCompany(slug));
      } catch (err) {
        setLoadError(err instanceof FulfilmentApiError ? err.message : "Could not load this booking page right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const parsedParcelCount = Number.parseInt(numberOfParcels, 10);
  const parcelCountValid = Number.isInteger(parsedParcelCount) && parsedParcelCount >= 1 && parsedParcelCount <= 50;

  const canSubmit =
    customerName.trim() &&
    customerContact.trim() &&
    destinationCountry &&
    collectionAddress.trim() &&
    collectionPostcode.trim() &&
    preferredDate &&
    parcelSizeTier &&
    parcelCountValid;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !destinationCountry || !parcelSizeTier) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await collectUkBookings.create(slug, {
        customerName: customerName.trim(),
        customerContact: customerContact.trim(),
        destinationCountry,
        collectionAddress: collectionAddress.trim(),
        collectionPostcode: collectionPostcode.trim(),
        preferredDate,
        parcelSizeTier,
        numberOfParcels: parsedParcelCount,
        specialInstructions: specialInstructions.trim() || undefined,
      });
      setConfirmation(result);
    } catch (err) {
      setSubmitError(err instanceof FulfilmentApiError ? err.message : "Could not book your collection right now.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5 px-6 py-3.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-dark text-white">
            <Package size={17} />
          </span>
          <span className="text-lg font-semibold text-text">Faira Collect</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        {loading && (
          <Card className="flex flex-col gap-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
          </Card>
        )}

        {!loading && loadError && <Alert tone="error">{loadError}</Alert>}

        {!loading && company && !confirmation && (
          <>
            <h1 className="text-xl font-semibold text-text">Book a collection with {company.name}</h1>
            <p className="mt-1 text-sm text-muted">A Faira driver will collect your parcel and deliver it to {company.name}.</p>

            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <MessageSquare size={15} className="text-primary" /> SMS updates at every step
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Truck size={15} className="text-primary" /> Doorstep collection
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle size={15} className="text-primary" /> No account needed
              </span>
            </div>

            <Card className="mt-6">
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Field label="Your name" required>
                  {p => <Input {...p} value={customerName} onChange={e => setCustomerName(e.target.value)} />}
                </Field>

                <Field label="Contact number or email" required>
                  {p => <Input {...p} value={customerContact} onChange={e => setCustomerContact(e.target.value)} placeholder="+44 7700 900000" />}
                </Field>

                <Field label="Destination country" required>
                  {p => (
                    <Select
                      {...p}
                      value={destinationCountry}
                      onValueChange={setDestinationCountry}
                      options={company.countriesServed.map(c => ({ value: c, label: c }))}
                      placeholder="Select a country"
                    />
                  )}
                </Field>

                <Field label="Collection address" required>
                  {p => <Input {...p} value={collectionAddress} onChange={e => setCollectionAddress(e.target.value)} />}
                </Field>

                <Field label="Postcode" required>
                  {p => <Input {...p} value={collectionPostcode} onChange={e => setCollectionPostcode(e.target.value)} placeholder="E1 6AN" />}
                </Field>

                <Field label="Preferred collection date" required>
                  {p => <Input {...p} type="date" value={preferredDate} onChange={e => setPreferredDate(e.target.value)} />}
                </Field>

                <Field label="Parcel size" required>
                  {p => (
                    <Select
                      {...p}
                      value={parcelSizeTier}
                      onValueChange={value => setParcelSizeTier(value as ParcelSizeTier)}
                      options={SIZE_OPTIONS}
                      placeholder="Select a size"
                    />
                  )}
                </Field>

                <Field label="Number of parcels" hint="How many boxes we should collect (each gets its own label)" required>
                  {p => (
                    <Input
                      {...p}
                      type="number"
                      min={1}
                      max={50}
                      value={numberOfParcels}
                      onChange={e => setNumberOfParcels(e.target.value)}
                    />
                  )}
                </Field>

                <Field label="Special instructions" hint="Optional">
                  {p => <Textarea {...p} value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value)} />}
                </Field>

                {submitError && <Alert tone="error">{submitError}</Alert>}

                <Button type="submit" size="lg" loading={submitting} disabled={!canSubmit}>
                  Book collection
                </Button>
              </form>
            </Card>
          </>
        )}

        {confirmation && (
          <Card className="mt-6 flex flex-col items-center gap-3 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green/10 text-green">
              <CheckCircle size={30} />
            </span>
            <h1 className="text-xl font-semibold text-text">Booking confirmed</h1>
            <p className="text-sm text-muted">Your reference is</p>
            <p className="rounded-md bg-light px-4 py-2 font-mono text-lg font-semibold tracking-wide text-text">
              {confirmation.reference}
            </p>
            <div className="w-full text-left">
              <Alert tone="success">
                Save your tracking link:{" "}
                <a href={confirmation.trackingUrl} className="cursor-pointer font-medium underline break-all">
                  {confirmation.trackingUrl}
                </a>
              </Alert>
            </div>
            <div className="mt-1 w-full rounded-md border border-border bg-bg p-4 text-left">
              <p className="text-sm font-semibold text-text">What happens next</p>
              <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted">
                <li>We&rsquo;ll text you when your collection is scheduled.</li>
                <li>A Faira driver collects your parcel from your doorstep.</li>
                <li>You&rsquo;re notified the moment it reaches the warehouse.</li>
              </ol>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
