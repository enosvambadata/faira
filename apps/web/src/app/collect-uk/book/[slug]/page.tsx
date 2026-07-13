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
import { Checkbox } from "@/components/ui/Checkbox";
import { Package, CheckCircle, MessageSquare, Truck } from "@/components/ui/icons";
import {
  collectUkBookings,
  CollectUkBookingCompany,
  BookingConfirmation,
  ParcelSizeTier,
  CollectUkItemType,
  CollectUkVehicleType,
  FulfilmentApiError,
} from "@/lib/api";
import { ITEM_TYPE_LABELS, VEHICLE_TYPE_LABELS } from "@/lib/collectUkItemLabels";

const SIZE_OPTIONS: { value: ParcelSizeTier; label: string }[] = [
  { value: "SMALL", label: "Small (shoebox)" },
  { value: "MEDIUM", label: "Medium (microwave)" },
  { value: "LARGE", label: "Large (suitcase)" },
  { value: "EXTRA_LARGE", label: "Extra large" },
];

const ITEM_TYPE_ORDER: CollectUkItemType[] = ["DRUM", "SUITCASE", "FRIDGE", "STOVE", "PALLET", "VEHICLE", "OTHER"];

const VEHICLE_OPTIONS: { value: CollectUkVehicleType; label: string }[] = (
  ["SEDAN", "SUV", "TRUCK"] as CollectUkVehicleType[]
).map(value => ({ value, label: VEHICLE_TYPE_LABELS[value] }));

function formatWindowDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

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
  const [parcelSizeTier, setParcelSizeTier] = useState<ParcelSizeTier | undefined>(undefined);
  const [numberOfParcels, setNumberOfParcels] = useState("1");
  const [itemTypes, setItemTypes] = useState<CollectUkItemType[]>([]);
  const [itemTypeOther, setItemTypeOther] = useState("");
  const [vehicleType, setVehicleType] = useState<CollectUkVehicleType | undefined>(undefined);
  const [specialInstructions, setSpecialInstructions] = useState("");

  const toggleItemType = (type: CollectUkItemType, checked: boolean) => {
    setItemTypes(prev => (checked ? [...prev, type] : prev.filter(t => t !== type)));
  };
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

  const itemTypesValid =
    itemTypes.length > 0 &&
    (!itemTypes.includes("OTHER") || itemTypeOther.trim().length > 0) &&
    (!itemTypes.includes("VEHICLE") || vehicleType);

  const canSubmit =
    customerName.trim() &&
    customerContact.trim() &&
    destinationCountry &&
    collectionAddress.trim() &&
    collectionPostcode.trim() &&
    parcelSizeTier &&
    parcelCountValid &&
    itemTypesValid;

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
        parcelSizeTier,
        numberOfParcels: parsedParcelCount,
        itemTypes,
        itemTypeOther: itemTypes.includes("OTHER") ? itemTypeOther.trim() : undefined,
        vehicleType: itemTypes.includes("VEHICLE") ? vehicleType : undefined,
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

            <div className="mt-4 rounded-md border border-primary-light bg-primary-light/50 p-3.5 text-sm">
              {company.nextWindow ? (
                <>
                  <span className="font-semibold text-primary-dark">
                    Next collection week: {formatWindowDate(company.nextWindow.startDate)} –{" "}
                    {formatWindowDate(company.nextWindow.endDate)}
                  </span>
                  <p className="mt-0.5 text-muted">
                    Book now and we&rsquo;ll text you your exact collection day within that week.
                  </p>
                </>
              ) : (
                <>
                  <span className="font-semibold text-primary-dark">Collection dates coming soon</span>
                  <p className="mt-0.5 text-muted">
                    Book now to reserve your spot — we&rsquo;ll text you as soon as your collection week is set.
                  </p>
                </>
              )}
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

                <fieldset>
                  <legend className="text-sm font-medium text-text">
                    What are you sending? <span className="text-red">*</span>
                  </legend>
                  <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {ITEM_TYPE_ORDER.map(type => (
                      <Checkbox
                        key={type}
                        id={`item-type-${type.toLowerCase()}`}
                        checked={itemTypes.includes(type)}
                        onCheckedChange={checked => toggleItemType(type, checked)}
                        label={ITEM_TYPE_LABELS[type]}
                      />
                    ))}
                  </div>
                </fieldset>

                {itemTypes.includes("OTHER") && (
                  <Field label="What is it?" hint="Describe the other item(s)" required>
                    {p => <Input {...p} value={itemTypeOther} onChange={e => setItemTypeOther(e.target.value)} />}
                  </Field>
                )}

                {itemTypes.includes("VEHICLE") && (
                  <Field label="Vehicle type" required>
                    {p => (
                      <Select
                        {...p}
                        value={vehicleType}
                        onValueChange={value => setVehicleType(value as CollectUkVehicleType)}
                        options={VEHICLE_OPTIONS}
                        placeholder="Select vehicle type"
                      />
                    )}
                  </Field>
                )}

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
