"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { createClient } from "@/lib/supabase";
import { auth } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Supabase rejects password login for an unconfirmed email -- surface a
  // resend affordance rather than a misleading "incorrect password".
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);
  // A visitor with a live session gets an explicit choice (continue as X /
  // switch account) instead of being silently bounced into the previous
  // session's portal -- confusing when testing with multiple accounts.
  const [existingEmail, setExistingEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await createClient().auth.getUser();
      setExistingEmail(data.user?.email ?? null);
    })();
  }, []);

  // Bare logins land on the Collect UK home (companies + driver in one
  // place); Fulfilment surfaces link to /login with an explicit next.
  const destination = searchParams.get("next") || "/collect-uk";

  const handleSwitchAccount = async () => {
    await createClient().auth.signOut();
    setExistingEmail(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setUnconfirmed(false);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        // Supabase returns code "email_not_confirmed" when the account exists
        // but the confirm link hasn't been clicked yet.
        if (signInError.code === "email_not_confirmed") {
          setUnconfirmed(true);
        } else {
          setError("Incorrect email or password");
        }
        return;
      }
      router.push(destination);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    try {
      const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(searchParams.get("next") ?? "/")}`;
      await auth.resendConfirmation(email.trim(), callbackUrl);
    } catch {
      // best-effort
    } finally {
      setResent(true);
    }
  };

  if (existingEmail) {
    return (
      <Card>
        <h1 className="text-xl font-semibold text-text">You&rsquo;re already signed in</h1>
        <p className="mt-1 text-sm text-muted">
          Signed in as <span className="font-medium text-text">{existingEmail}</span>.
        </p>
        <div className="mt-5 flex flex-col gap-3">
          <Button type="button" fullWidth size="lg" onClick={() => router.push(destination)}>
            Continue
          </Button>
          <Button type="button" fullWidth size="lg" variant="secondary" onClick={handleSwitchAccount}>
            Sign in with a different account
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="text-xl font-semibold text-text">Sign in</h1>
      <p className="mt-1 text-sm text-muted">Welcome back to Vamba Collect.</p>

      <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-4">
        <Field label="Email address" required>
          {fieldProps => (
            <Input {...fieldProps} type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
          )}
        </Field>

        <Field label="Password" required>
          {fieldProps => (
            <Input
              {...fieldProps}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          )}
        </Field>

        {error && <Alert tone="error">{error}</Alert>}

        {unconfirmed && (
          <Alert tone="warning">
            Please confirm your email first — check your inbox for the link.{" "}
            <button type="button" onClick={handleResend} className="font-medium underline">
              {resent ? "Link resent" : "Resend it"}
            </button>
          </Alert>
        )}

        <Button type="submit" fullWidth size="lg" loading={submitting}>
          Sign in
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link
          href={searchParams.get("next") ? `/signup?redirect=${encodeURIComponent(searchParams.get("next")!)}` : "/signup"}
          className="font-medium text-primary"
        >
          Create an account
        </Link>
      </p>
    </Card>
  );
}

export default function LoginPage() {
  return (
    // Collect UK's navy "Trust & Authority" theme applies to the whole app.
    <div className="theme-collect">
      <Suspense>
        <AuthLayout brand="Vamba Collect">
          <LoginForm />
        </AuthLayout>
      </Suspense>
    </div>
  );
}
