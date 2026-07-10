// The `paynow` package ships its TS source but publishes no declaration
// files (package.json has no "types" field), so tsc can't resolve them from
// "main": "dist/index.js" — this hand-written declaration covers only the
// surface this app actually calls, based on reading node_modules/paynow/src.
declare module 'paynow' {
  export class StatusResponse {
    reference: string;
    amount: string;
    paynowReference: string;
    pollUrl: string;
    status: string;
    error: string;
  }

  export class InitResponse {
    success: boolean;
    hasRedirect: boolean;
    redirectUrl: string;
    error: string;
    pollUrl: string;
    instructions: string;
    status: string;
  }

  export class Payment {
    constructor(reference: string, authEmail: string);
    add(title: string, amount: number, quantity?: number): Payment;
  }

  export class Paynow {
    constructor(integrationId: string, integrationKey: string, resultUrl: string, returnUrl: string);
    createPayment(reference: string, authEmail: string): Payment;
    send(payment: Payment): Promise<InitResponse>;
    sendMobile(payment: Payment, phone: string, method: string): Promise<InitResponse>;
    pollTransaction(url: string): Promise<InitResponse>;
    parseStatusUpdate(response: string): StatusResponse;
  }
}
