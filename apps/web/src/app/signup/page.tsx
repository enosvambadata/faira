"use client";

import { useState, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { auth, FulfilmentApiError } from "@/lib/api";

interface FormState {
  email: string;
  password: string;
  confirmPassword: string;
}

function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!form.email.trim()) errors.email = "Enter your email address";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = "Enter a valid email address";

  if (!form.password) errors.password = "Choose a password";
  else if (form.password.length < 8) errors.password = "Password must be at least 8 characters";

  if (form.confirmPassword !== form.password) errors.confirmPassword = "Passwords don't match";

  return errors;
}

// The redirect param says what the visitor is actually here to do -- the
// page should speak to that journey, not a generic "create an account".
function signupContext(redirect: string | null): { title: string; subtitle: string; step2: string } {
  if (redirect?.startsWith("/collect-uk/register")) {
    return {
      title: "Register your shipping company",
      subtitle: "Get a booking link for your customers and let Vamba Collect handle your UK collections.",
      step2: "Company details",
    };
  }
  if (redirect?.startsWith("/collect-uk/drive")) {
    return {
      title: "Apply to drive for Vamba Collect",
      subtitle: "Own van, paid collection routes in your area. Have your insurance documents ready.",
      step2: "Your van & documents",
    };
  }
  if (redirect?.startsWith("/onboarding")) {
    return {
      title: "Become a Faira Fulfilment seller",
      subtitle: "Ship your marketplace orders through Faira's hubs.",
      step2: "Seller details",
    };
  }
  if (redirect?.startsWith("/market")) {
    return {
      title: "Create your Faira account",
      subtitle: "Buy and sell car parts and engines — protected by escrow.",
      step2: "Start buying & selling",
    };
  }
  return {
    title: "Create your Vamba Collect account",
    subtitle: "Register your shipping company's collections — or apply to drive for Vamba Collect.",
    step2: "Choose your path",
  };
}

// Fulfilment journeys keep the warm brand; everything else (Collect UK is
// the flagship) gets the navy Collect theme so the signup page matches
// the page the visitor just came from.
function isFulfilmentTarget(target: string | null): boolean {
  return Boolean(target && ["/onboarding", "/dashboard", "/fulfilment", "/shipments", "/hub-ops"].some(p => target.startsWith(p)));
}

function SignupForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const context = signupContext(redirect);
  const isMarket = Boolean(redirect?.startsWith("/market"));
  const themeClass = isMarket || isFulfilmentTarget(redirect) ? "" : "theme-collect";
  const brand = isMarket ? "Faira Parts" : "Vamba Collect";
  const loginHref = redirect ? `/login?next=${encodeURIComponent(redirect)}` : "/login";
  const [form, setForm] = useState<FormState>({ email: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set once the account is created: the email we sent the confirm link to.
  // Presence of this flips the page to the "check your inbox" state -- we
  // never auto-login, the account isn't usable until the link is clicked.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationErrors = validate(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      await auth.signup({ email: form.email.trim(), password: form.password });
      setSentTo(form.email.trim());
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.code === "ACCOUNT_ALREADY_EXISTS") {
        setSubmitError("An account with this email already exists. Try signing in instead.");
      } else {
        setSubmitError(err instanceof Error ? err.message : "Could not create your account right now");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!sentTo) return;
    setResending(true);
    try {
      await auth.resendConfirmation(sentTo);
      setResent(true);
    } catch {
      // resend is best-effort; the original email may still arrive
      setResent(true);
    } finally {
      setResending(false);
    }
  };

  if (sentTo) {
    return (
      <div className={themeClass}>
        <AuthLayout brand={brand}>
          <Card>
            <h1 className="text-xl font-semibold text-text">Confirm your email</h1>
            <p className="mt-2 text-sm text-muted">
              We&apos;ve sent a confirmation link to <span className="font-medium text-text">{sentTo}</span>. Click it to
              activate your account, then sign in.
            </p>
            <p className="mt-2 text-sm text-muted">
              Can&apos;t find it? Check your spam folder, or resend the link below.
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <Link href={loginHref}>
                <Button type="button" fullWidth size="lg">
                  Go to sign in
                </Button>
              </Link>
              <Button type="button" fullWidth size="lg" variant="secondary" loading={resending} onClick={handleResend}>
                {resent ? "Confirmation link resent" : "Resend confirmation link"}
              </Button>
            </div>
          </Card>
        </AuthLayout>
      </div>
    );
  }

  return (
    <div className={themeClass}>
    <AuthLayout brand={brand}>
      <Card>
        <h1 className="text-xl font-semibold text-text">{context.title}</h1>
        <p className="mt-1 text-sm text-muted">{context.subtitle}</p>

        <ol className="mt-4 flex items-center gap-2 text-xs font-medium">
          <li className="flex items-center gap-1.5 text-primary">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">1</span>
            Create account
          </li>
          <li aria-hidden="true" className="h-px w-6 bg-border" />
          <li className="flex items-center gap-1.5 text-muted">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10px] font-bold">2</span>
            {context.step2}
          </li>
        </ol>

        <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-4">
          <Field label="Email address" error={errors.email} required>
            {fieldProps => (
              <Input
                {...fieldProps}
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
              />
            )}
          </Field>

          <Field label="Password" hint="At least 8 characters" error={errors.password} required>
            {fieldProps => (
              <Input
                {...fieldProps}
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
              />
            )}
          </Field>

          <Field label="Confirm password" error={errors.confirmPassword} required>
            {fieldProps => (
              <Input
                {...fieldProps}
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
              />
            )}
          </Field>

          {submitError && <Alert tone="error">{submitError}</Alert>}

          <Button type="submit" fullWidth size="lg" loading={submitting}>
            Create account
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href={loginHref} className="font-medium text-primary">
            Sign in
          </Link>
        </p>
      </Card>
    </AuthLayout>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
