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

// Optional-but-important config: notifications are best-effort, so a missing
// provider can't crash the boot — but it CAN make the product silently mute in
// the field (SCRUM-261). Warn loudly at startup so a live deploy without a
// working customer channel is obvious in the logs rather than invisible.
export function warnOptionalConfig(
  log: { warn: (obj: unknown, msg: string) => void },
  env: Record<string, string | undefined> = process.env,
): void {
  const twilioSet = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM);
  const resendSet = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);

  if (!twilioSet) {
    log.warn(
      { hint: 'set TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM' },
      'Twilio not configured: SMS to UK (+44) numbers will NOT be delivered (Africa’s Talking cannot reach UK). Vamba Collect customer SMS is effectively muted.',
    );
  }
  if (!resendSet) {
    log.warn(
      { hint: 'set RESEND_API_KEY + EMAIL_FROM' },
      'Resend not configured: transactional email will not send. With Twilio also unset, customers would receive NO notifications on any channel.',
    );
  }
}
