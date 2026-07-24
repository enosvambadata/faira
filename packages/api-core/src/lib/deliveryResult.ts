// Outcome of a best-effort notification send (SMS or email). The transports
// never throw — they report what happened so the caller can record it to the
// Collect UK notification log, making silent delivery failures visible.
export type DeliveryStatus = 'SENT' | 'FAILED' | 'SKIPPED';

export interface DeliveryResult {
  status: DeliveryStatus;
  provider?: string; // 'twilio' | 'africas-talking' | 'resend'
  detail?: string; // reason for FAILED/SKIPPED, for the log
}
