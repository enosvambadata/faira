import { describe, it, expect, vi } from 'vitest';
import { assertRequiredEnv, warnOptionalConfig } from './requiredEnv';

describe('assertRequiredEnv', () => {
  it('throws, naming the missing var, when COLLECT_UK_TRACKING_TOKEN_SECRET is unset', () => {
    expect(() => assertRequiredEnv({})).toThrow(/COLLECT_UK_TRACKING_TOKEN_SECRET/);
  });

  it('passes when all required vars are present', () => {
    expect(() => assertRequiredEnv({ COLLECT_UK_TRACKING_TOKEN_SECRET: 'a-secret' })).not.toThrow();
  });
});

describe('warnOptionalConfig', () => {
  const TWILIO = { TWILIO_ACCOUNT_SID: 'a', TWILIO_AUTH_TOKEN: 'b', TWILIO_FROM: 'c' };
  const RESEND = { RESEND_API_KEY: 'k', EMAIL_FROM: 'e' };

  it('warns about both channels when neither provider is configured', () => {
    const log = { warn: vi.fn() };
    warnOptionalConfig(log, {});
    expect(log.warn).toHaveBeenCalledTimes(2);
    expect(log.warn.mock.calls.map(c => c[1]).join(' ')).toMatch(/Twilio.*Resend|Resend.*Twilio/s);
  });

  it('is silent when both Twilio and Resend are fully configured', () => {
    const log = { warn: vi.fn() };
    warnOptionalConfig(log, { ...TWILIO, ...RESEND });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('warns only about the missing provider (partial Twilio counts as unset)', () => {
    const log = { warn: vi.fn() };
    warnOptionalConfig(log, { TWILIO_ACCOUNT_SID: 'a', ...RESEND }); // Twilio incomplete
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0][1]).toMatch(/Twilio/);
  });
});
