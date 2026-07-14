"use client";

import { useState, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { auth, FulfilmentApiError } from "@/lib/api";
import { createClient } from "@/lib/supabase";

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
      subtitle: "Get a booking link for your customers and let Faira handle your UK collections.",
      step2: "Company details",
    };
  }
  if (redirect?.startsWith("/collect-uk/drive")) {
    return {
      title: "Apply to drive for Faira",
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
  return {
    title: "Create your Faira account",
    subtitle: "Register your shipping company's collections — or apply to drive for Faira.",
    step2: "Choose your path",
  };
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const context = signupContext(searchParams.get("redirect"));
  const [form, setForm] = useState<FormState>({ email: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationErrors = validate(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      await auth.signup({ email: form.email.trim(), password: form.password });

      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
      if (error) throw error;

      // Collect UK is the flagship: a bare signup lands on its home (register
      // a company / apply to drive). Fulfilment flows always arrive with an
      // explicit ?redirect=/onboarding from the /fulfilment welcome page.
      router.push(searchParams.get("redirect") || "/collect-uk");
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

  return (
    <AuthLayout>
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
          <Link
            href={searchParams.get("redirect") ? `/login?next=${encodeURIComponent(searchParams.get("redirect")!)}` : "/login"}
            className="font-medium text-primary"
          >
            Sign in
          </Link>
        </p>
      </Card>
    </AuthLayout>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
