import { Paynow, InitResponse, StatusResponse } from 'paynow';

// Zimswitch/card payments go through Paynow's hosted web checkout (a
// browserurl redirect) — Paynow's Express Checkout ("mobile") flow only
// supports Ecocash and OneMoney, per the SDK's own docs.
export type MobileMoneyMethod = 'ecocash' | 'onemoney';

function client(): Paynow {
  return new Paynow(
    process.env.PAYNOW_INTEGRATION_ID || 'placeholder-integration-id',
    process.env.PAYNOW_INTEGRATION_KEY || 'placeholder-integration-key',
    `${process.env.API_BASE_URL || 'http://localhost:3000'}/api/v1/webhooks/paynow`,
    `${process.env.MOBILE_APP_URL || 'https://faira.app'}/orders`,
  );
}

export async function initiateWebPayment(
  reference: string,
  authEmail: string,
  amount: number,
  itemTitle: string,
): Promise<InitResponse> {
  const paynow = client();
  const payment = paynow.createPayment(reference, authEmail).add(itemTitle, amount);
  return paynow.send(payment);
}

export async function initiateMobilePayment(
  reference: string,
  authEmail: string,
  amount: number,
  itemTitle: string,
  phone: string,
  method: MobileMoneyMethod,
): Promise<InitResponse> {
  const paynow = client();
  const payment = paynow.createPayment(reference, authEmail).add(itemTitle, amount);
  return paynow.sendMobile(payment, phone, method);
}

export async function pollPaymentStatus(pollUrl: string): Promise<InitResponse> {
  return client().pollTransaction(pollUrl);
}

// Throws if the result webhook's hash doesn't match — callers must not act
// on the payload until this has verified it actually came from Paynow.
export function parsePaynowResultWebhook(rawBody: string): StatusResponse {
  return client().parseStatusUpdate(rawBody);
}

// Both the poll response and the result-webhook response report status
// under a different casing/field than each other in practice (Paynow's
// docs list "Paid" but the SDK lowercases it) — normalize here so callers
// have one check.
export function isPaidStatus(status: string): boolean {
  return status.toLowerCase() === 'paid';
}
