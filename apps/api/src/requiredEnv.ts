// Environment variables the API cannot function correctly without. Validated
// once at startup (server.ts) so a misconfiguration fails the deploy loudly
// instead of surfacing later as a per-request 500.
//
// COLLECT_UK_TRACKING_TOKEN_SECRET is the motivating case: without it, a guest
// booking commits successfully and THEN 500s when it tries to mint the
// tracking link (getSecret throws), leaving the customer with a created
// booking, no tracking URL, and no confirmation SMS. Far better to never boot
// in that state.
const REQUIRED_ENV = ['COLLECT_UK_TRACKING_TOKEN_SECRET'] as const;

export function assertRequiredEnv(env: Record<string, string | undefined> = process.env): void {
  const missing = REQUIRED_ENV.filter(key => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}
