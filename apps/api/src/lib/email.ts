import { logger } from '../logger';
import { DeliveryResult } from './deliveryResult';

// Best-effort transactional email. No-op (logs and returns) until
// RESEND_API_KEY and EMAIL_FROM are configured -- same philosophy as
// lib/sms.ts: an unconfigured or failed send must never fail the request
// that triggered it. Uses Resend's REST API directly (no SDK dependency);
// swapping providers is a change to this one file, exactly like the SMS
// transport. Returns a DeliveryResult so callers can record the outcome.
export async function sendEmail(to: string, subject: string, html: string): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    logger.info({ to, subject }, 'email not sent: no email provider configured (set RESEND_API_KEY + EMAIL_FROM)');
    return { status: 'SKIPPED', provider: 'resend', detail: 'no email provider configured' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      logger.error({ status: res.status, to }, 'email send failed');
      return { status: 'FAILED', provider: 'resend', detail: `http ${res.status}` };
    }
    return { status: 'SENT', provider: 'resend' };
  } catch (err) {
    logger.error({ err, to }, 'email send failed');
    return { status: 'FAILED', provider: 'resend', detail: err instanceof Error ? err.message : 'email send failed' };
  }
}
