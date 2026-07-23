"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";

// The email confirmation link returns here (emailRedirectTo). The browser
// Supabase client parses the session from the URL, then we forward the user to
// wherever they were headed — logged in — instead of leaving a raw token on
// the Site-URL page.
function Callback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const [message, setMessage] = useState("Confirming your email…");

  useEffect(() => {
    const supabase = createClient();
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      router.replace(next);
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) go();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) go();
    });

    // Fallback: if no session materialises (expired/invalid link), send to sign in.
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      setMessage("Couldn't confirm automatically — taking you to sign in…");
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }, 6000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [next, router]);

  return <div className="flex min-h-screen items-center justify-center px-4 text-center text-sm text-muted">{message}</div>;
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <Callback />
    </Suspense>
  );
}
