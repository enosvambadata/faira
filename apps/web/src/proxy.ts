import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/verification",
  "/profile",
  "/notifications",
  "/support",
  "/shipments",
  "/hub-ops",
];
const PUBLIC_ONLY_PREFIXES = ["/login", "/signup"];

// This is an optimistic check only (redirect unauthenticated visitors away
// from app pages so they don't briefly flash protected UI) — it is not the
// actual authorization boundary. Every real permission/ownership check
// happens server-side in apps/api, exactly as it does for the mobile app.
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: cookies => {
          cookies.forEach(({ name, value }) => request.cookies.set(name, value));
          cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some(prefix => path.startsWith(prefix));
  const isPublicOnly = PUBLIC_ONLY_PREFIXES.some(prefix => path.startsWith(prefix));

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (isPublicOnly && user) {
    // Honour the redirect/next param an already-authenticated visitor
    // arrived with (e.g. the Collect UK welcome page's "Register your
    // company" button sends them through /signup?redirect=... even if
    // they're still logged in from an earlier session) -- falling back
    // to /dashboard only when neither is present, matching this proxy's
    // original single-product behaviour.
    const destination = request.nextUrl.searchParams.get("redirect") || request.nextUrl.searchParams.get("next") || "/dashboard";
    const url = request.nextUrl.clone();
    url.pathname = destination;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
