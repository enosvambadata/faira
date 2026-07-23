import { createClient } from "./supabase";

// Shared HTTP core for every Faira web app: the Bearer-token request layer,
// the typed ApiError, and the server-controlled auth endpoints. Product-
// specific API methods (market, collect-uk, fulfilment) live in each app's
// own lib/api.ts, which imports request()/requestRaw() from here.

// Exported so apps that do direct fetches (e.g. multipart uploads that bypass
// request()) can build absolute URLs against the same base.
export const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Lazy: this module is re-exported from the @faira/ui barrel, so it loads
// whenever any shared component is imported (including in unit tests). Creating
// the Supabase browser client only on first authenticated request keeps that
// import side-effect-free and env-independent.
let _supabase: ReturnType<typeof createClient> | undefined;
function supabase() {
  return (_supabase ??= createClient());
}

export class ApiError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(code: string, message: string, status: number, details: unknown = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  // Faira-internal admin surfaces (Collect UK dispatch) authenticate with
  // the shared ADMIN_TOKEN header instead of a Supabase session.
  adminToken?: string;
}

// Mirrors apps/mobile/src/lib/api.ts's request<T>() shape so both clients
// talk to the same backend the same way — auth is always a Supabase
// access token in the Authorization header, never a cookie/session sent
// to the API directly.
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};

  if (options.auth) {
    const {
      data: { session },
    } = await supabase().auth.getSession();
    if (session) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  }

  if (options.adminToken) {
    headers["x-admin-token"] = options.adminToken;
  }

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = json?.error ?? {};
    throw new ApiError(err.code ?? "UNKNOWN_ERROR", err.message ?? "Something went wrong", res.status, err.details ?? null);
  }

  return json.data as T;
}

// Like request(), but returns the whole response envelope rather than just
// `data` — for list endpoints that carry pagination metadata alongside it
// (e.g. the marketplace browse: { data, hasMore, total }).
export async function requestRaw<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};

  if (options.auth) {
    const {
      data: { session },
    } = await supabase().auth.getSession();
    if (session) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  }

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_URL}${path}`, { method: options.method ?? "GET", headers, body });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = json?.error ?? {};
    throw new ApiError(err.code ?? "UNKNOWN_ERROR", err.message ?? "Something went wrong", res.status, err.details ?? null);
  }

  return json as T;
}

export const auth = {
  // Reuses the existing Express endpoint (not the Supabase browser client's
  // own signUp) so account creation stays server-controlled. The account is
  // created UNconfirmed and Supabase emails a confirm link — the caller must
  // not auto-login, it shows a "check your inbox" screen (see signup/page.tsx).
  // Login goes straight through the browser Supabase client so @supabase/ssr's
  // cookie-based session sync stays correct.
  signup: (payload: { email: string; password: string; redirectTo?: string }) =>
    request<{
      id: string;
      email: string | null;
      phone: string | null;
      confirmationEmailSent?: boolean;
    }>("/api/v1/auth/signup", {
      method: "POST",
      body: payload,
    }),

  resendConfirmation: (email: string, redirectTo?: string) =>
    request<{ message: string }>("/api/v1/auth/email/resend", {
      method: "POST",
      body: { email, redirectTo },
    }),
};
