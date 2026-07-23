import AfricasTalking from 'africastalking';
import { logger } from '../logger';
import { DeliveryResult } from './deliveryResult';

// SMS transport. Prefers Twilio when configured (TWILIO_ACCOUNT_SID +
// TWILIO_AUTH_TOKEN + TWILIO_FROM) and otherwise falls back to Africa's
// Talking. This exists because Africa's Talking only reaches African telcos:
// it rejects +44 numbers, and staging runs it in sandbox (no real delivery),
// so real UK SMS -- the only channel to Collect UK guest customers -- needs a
// UK-capable provider. Twilio is that provider; the swap is env-only, dormant
// until the TWILIO_* vars are set, same pluggable seam as lib/email.ts.
//
// Best-effort throughout: a failed or unreachable send must never fail the
// request that triggered it, same philosophy as sendPushNotification.

function normalise(to: string): string {
  return to.startsWith('+') ? to : `+${to}`;
}

async function sendViaTwilio(to: string, message: string): Promise<DeliveryResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM!;

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: normalise(to), From: from, Body: message }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    logger.error({ status: res.status }, 'Twilio SMS send failed');
    return { status: 'FAILED', provider: 'twilio', detail: `http ${res.status}` };
  }
  return { status: 'SENT', provider: 'twilio' };
}

async function sendViaAfricasTalking(to: string, message: string): Promise<DeliveryResult> {
  const africastalking = AfricasTalking({
    apiKey: process.env.AFRICAS_TALKING_API_KEY || 'placeholder-api-key',
    username: process.env.AFRICAS_TALKING_USERNAME || 'sandbox',
  });
  await africastalking.SMS.send({ to: [normalise(to)], message });
  return { status: 'SENT', provider: 'africas-talking' };
}

export async function sendSms(to: string, message: string): Promise<DeliveryResult> {
  try {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) {
      return await sendViaTwilio(to, message);
    }
    return await sendViaAfricasTalking(to, message);
  } catch (err) {
    logger.error({ err }, 'SMS send failed');
    return { status: 'FAILED', detail: err instanceof Error ? err.message : 'sms send failed' };
  }
}
