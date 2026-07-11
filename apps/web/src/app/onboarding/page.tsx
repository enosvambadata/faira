"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Stepper } from "@/components/ui/Stepper";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { ChevronLeft } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { sellerOnboarding, hubs as hubsApi, OnboardingDraftUpdate, Hub, FulfilmentApiError } from "@/lib/api";
import { PRODUCT_CATEGORIES } from "@/lib/categories";

const STEP_LABELS = ["About you", "Your business", "What you sell", "Your shop", "Hub", "Review"];

interface FormState {
  fullName: string;
  mobileNumber: string;
  sellerType: "INDIVIDUAL" | "REGISTERED_BUSINESS" | "";
  businessName: string;
  productCategories: string[];
  hasPhysicalShop: "yes" | "no" | "";
  shopAddress: string;
  city: string;
  preferredHubId: string;
  nationalIdNumber: string;
  agreeToTerms: boolean;
}

const EMPTY_FORM: FormState = {
  fullName: "",
  mobileNumber: "",
  sellerType: "",
  businessName: "",
  productCategories: [],
  hasPhysicalShop: "",
  shopAddress: "",
  city: "",
  preferredHubId: "",
  nationalIdNumber: "",
  agreeToTerms: false,
};

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [hubOptions, setHubOptions] = useState<Hub[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [draft, hubList] = await Promise.all([sellerOnboarding.getDraft(), hubsApi.list()]);
        if (draft.status === "SUBMITTED") {
          router.replace("/dashboard");
          return;
        }
        setForm({
          fullName: draft.fullName ?? "",
          mobileNumber: draft.mobileNumber ?? "",
          sellerType: draft.sellerType ?? "",
          businessName: draft.businessName ?? "",
          productCategories: draft.productCategories,
          hasPhysicalShop: draft.hasPhysicalShop === null ? "" : draft.hasPhysicalShop ? "yes" : "no",
          shopAddress: draft.shopAddress ?? "",
          city: draft.city ?? "",
          preferredHubId: draft.preferredHubId ?? "",
          nationalIdNumber: draft.nationalIdNumber ?? "",
          agreeToTerms: draft.agreedToTerms,
        });
        setHubOptions(hubList);
      } catch {
        setLoadError("Could not load your registration. Try reloading the page.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateStep = (index: number): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (index === 0) {
      if (!form.fullName.trim()) next.fullName = "Enter your full name";
      if (!/^\+[1-9]\d{6,14}$/.test(form.mobileNumber.trim())) next.mobileNumber = "Use international format, e.g. +263771234567";
    }
    if (index === 1) {
      if (!form.sellerType) next.sellerType = "Choose one";
      if (form.sellerType === "REGISTERED_BUSINESS" && !form.businessName.trim()) next.businessName = "Enter your business name";
    }
    if (index === 2) {
      if (form.productCategories.length === 0) next.productCategories = "Choose at least one category";
    }
    if (index === 3) {
      if (!form.hasPhysicalShop) next.hasPhysicalShop = "Choose one";
      if (form.hasPhysicalShop === "yes" && !form.shopAddress.trim()) next.shopAddress = "Enter your shop address";
      if (!form.city.trim()) next.city = "Enter your city";
    }
    if (index === 4) {
      if (!form.preferredHubId) next.preferredHubId = "Choose a hub";
    }
    if (index === 5) {
      if (!form.agreeToTerms) next.agreeToTerms = "You must agree to the seller terms to continue";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildPayload = (): OnboardingDraftUpdate => ({
    fullName: form.fullName.trim(),
    mobileNumber: form.mobileNumber.trim(),
    ...(form.sellerType ? { sellerType: form.sellerType } : {}),
    businessName: form.businessName.trim() || undefined,
    productCategories: form.productCategories,
    hasPhysicalShop: form.hasPhysicalShop === "" ? undefined : form.hasPhysicalShop === "yes",
    shopAddress: form.shopAddress.trim() || undefined,
    city: form.city.trim(),
    preferredHubId: form.preferredHubId || undefined,
    nationalIdNumber: form.nationalIdNumber.trim() || undefined,
    agreeToTerms: form.agreeToTerms,
  });

  const handleNext = async () => {
    if (!validateStep(step)) return;
    setSaving(true);
    try {
      await sellerOnboarding.saveDraft(buildPayload());
      if (step === STEP_LABELS.length - 1) {
        await sellerOnboarding.submit();
        router.push("/onboarding/submitted");
        return;
      }
      setStep(s => s + 1);
    } catch (err) {
      toast({
        title: "Couldn't save your progress",
        description: err instanceof Error ? err.message : "Please try again",
        tone: "error",
      });
      if (err instanceof FulfilmentApiError && err.code === "VALIDATION_ERROR") {
        setSubmitError("Please double-check your details — some required information is missing.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => setStep(s => Math.max(0, s - 1));

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell>
        <Alert tone="error">{loadError}</Alert>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-xl">
        <h1 className="text-xl font-semibold text-text">Complete your seller registration</h1>
        <p className="mt-1 text-sm text-muted">Your progress is saved automatically as you go.</p>

        <div className="mt-6">
          <Stepper steps={STEP_LABELS} currentStep={step} />
        </div>

        <Card className="mt-6">
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <Field label="Full name" error={errors.fullName} required>
                {p => <Input {...p} value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} />}
              </Field>
              <Field label="Mobile number" hint="Include country code, e.g. +263771234567" error={errors.mobileNumber} required>
                {p => (
                  <Input {...p} value={form.mobileNumber} onChange={e => setForm({ ...form, mobileNumber: e.target.value })} />
                )}
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <Field label="How do you sell?" error={errors.sellerType} required>
                {p => (
                  <RadioGroup
                    {...p}
                    value={form.sellerType}
                    onValueChange={value => setForm({ ...form, sellerType: value as FormState["sellerType"] })}
                    options={[
                      { value: "INDIVIDUAL", label: "Individual seller", description: "You sell on your own, informally" },
                      {
                        value: "REGISTERED_BUSINESS",
                        label: "Registered business",
                        description: "You have a registered business name",
                      },
                    ]}
                  />
                )}
              </Field>
              {form.sellerType === "REGISTERED_BUSINESS" && (
                <Field label="Business name" error={errors.businessName} required>
                  {p => (
                    <Input {...p} value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })} />
                  )}
                </Field>
              )}
            </div>
          )}

          {step === 2 && (
            <Field label="What do you sell?" hint="Choose all that apply" error={errors.productCategories} required>
              {() => (
                <div className="grid grid-cols-2 gap-2.5">
                  {PRODUCT_CATEGORIES.map(category => (
                    <Checkbox
                      key={category}
                      checked={form.productCategories.includes(category)}
                      onCheckedChange={checked =>
                        setForm({
                          ...form,
                          productCategories: checked
                            ? [...form.productCategories, category]
                            : form.productCategories.filter(c => c !== category),
                        })
                      }
                      label={category}
                    />
                  ))}
                </div>
              )}
            </Field>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <Field label="Do you have a physical shop?" error={errors.hasPhysicalShop} required>
                {p => (
                  <RadioGroup
                    {...p}
                    value={form.hasPhysicalShop}
                    onValueChange={value => setForm({ ...form, hasPhysicalShop: value as FormState["hasPhysicalShop"] })}
                    options={[
                      { value: "yes", label: "Yes", description: "I sell from a physical location" },
                      { value: "no", label: "No", description: "I sell online or informally only" },
                    ]}
                  />
                )}
              </Field>
              {form.hasPhysicalShop === "yes" && (
                <Field label="Shop address" error={errors.shopAddress} required>
                  {p => (
                    <Input {...p} value={form.shopAddress} onChange={e => setForm({ ...form, shopAddress: e.target.value })} />
                  )}
                </Field>
              )}
              <Field label="City" error={errors.city} required>
                {p => <Input {...p} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />}
              </Field>
            </div>
          )}

          {step === 4 && (
            <Field label="Preferred hub" hint="Where you'll usually drop off parcels" error={errors.preferredHubId} required>
              {p => (
                <Select
                  {...p}
                  value={form.preferredHubId || undefined}
                  onValueChange={value => setForm({ ...form, preferredHubId: value })}
                  options={hubOptions.map(hub => ({ value: hub.id, label: `${hub.name} — ${hub.city}` }))}
                  placeholder="Choose a hub"
                />
              )}
            </Field>
          )}

          {step === 5 && (
            <div className="flex flex-col gap-4">
              <div className="rounded-md bg-light p-4 text-sm">
                <dl className="flex flex-col gap-2">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Name</dt>
                    <dd className="text-right text-text">{form.fullName}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Mobile</dt>
                    <dd className="text-right text-text">{form.mobileNumber}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Selling as</dt>
                    <dd className="text-right text-text">
                      {form.sellerType === "REGISTERED_BUSINESS" ? form.businessName || "Registered business" : "Individual"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Categories</dt>
                    <dd className="text-right text-text">{form.productCategories.join(", ")}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">City</dt>
                    <dd className="text-right text-text">{form.city}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Preferred hub</dt>
                    <dd className="text-right text-text">
                      {hubOptions.find(h => h.id === form.preferredHubId)?.name ?? "—"}
                    </dd>
                  </div>
                </dl>
              </div>

              <Field label="National ID number" hint="Optional for now — required before verification" error={errors.nationalIdNumber}>
                {p => (
                  <Input
                    {...p}
                    value={form.nationalIdNumber}
                    onChange={e => setForm({ ...form, nationalIdNumber: e.target.value })}
                  />
                )}
              </Field>

              <Checkbox
                checked={form.agreeToTerms}
                onCheckedChange={checked => setForm({ ...form, agreeToTerms: checked })}
                label="I agree to the Faira Fulfilment seller terms and confirm the information above is accurate"
                aria-invalid={!!errors.agreeToTerms}
              />
              {errors.agreeToTerms && (
                <p role="alert" className="text-xs text-red">
                  {errors.agreeToTerms}
                </p>
              )}

              {submitError && <Alert tone="error">{submitError}</Alert>}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            <Button type="button" variant="ghost" onClick={handleBack} disabled={step === 0 || saving}>
              <ChevronLeft size={18} />
              Back
            </Button>
            <Button type="button" onClick={handleNext} loading={saving}>
              {step === STEP_LABELS.length - 1 ? "Submit registration" : "Next"}
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
