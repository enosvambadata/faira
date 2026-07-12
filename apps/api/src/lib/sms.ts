import AfricasTalking from 'africastalking';
import { logger } from '../logger';

// Africa's Talking is already configured and working in this app (the
// Supabase custom send-sms hook in routes/webhooks.ts uses it for phone
// OTP) -- this just exposes the same underlying SMS.send capability as a
// reusable, best-effort helper for arbitrary outbound messages, needed
// here because buyers have no app account (per the pivot brief) and SMS
// is their only reachable channel for things like collection codes.
//
// Best-effort: a failed or unreachable send should never fail the request
// that triggered it, same philosophy as sendPushNotification.
export async function sendSms(to: string, message: string): Promise<void> {
  try {
    const africastalking = AfricasTalking({
      apiKey: process.env.AFRICAS_TALKING_API_KEY || 'placeholder-api-key',
      username: process.env.AFRICAS_TALKING_USERNAME || 'sandbox',
    });

    const phone = to.startsWith('+') ? to : `+${to}`;
    await africastalking.SMS.send({ to: [phone], message });
  } catch (err) {
    logger.error({ err }, 'SMS send failed');
  }
}
