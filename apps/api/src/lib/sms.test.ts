import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const atSendMock = vi.fn();
vi.mock('africastalking', () => ({
  default: () => ({ SMS: { send: (...a: unknown[]) => atSendMock(...a) } }),
}));

const { sendSms } = await import('./sms');

const fetchMock = vi.fn();
const TWILIO_KEYS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'];

function configureTwilio() {
  process.env.TWILIO_ACCOUNT_SID = 'AC123';
  process.env.TWILIO_AUTH_TOKEN = 'authtok';
  process.env.TWILIO_FROM = '+15551234567';
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  for (const k of TWILIO_KEYS) delete process.env[k];
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of TWILIO_KEYS) delete process.env[k];
});

describe('sendSms', () => {
  it('sends via Twilio when TWILIO_* are configured', async () => {
    configureTwilio();
    fetchMock.mockResolvedValue({ ok: true, status: 201 });

    await sendSms('+447700900123', 'hello');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }),
      }),
    );
    const params = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
    expect(params.get('To')).toBe('+447700900123');
    expect(params.get('From')).toBe('+15551234567');
    expect(params.get('Body')).toBe('hello');
    expect(atSendMock).not.toHaveBeenCalled();
  });

  it("falls back to Africa's Talking when Twilio is not configured", async () => {
    atSendMock.mockResolvedValue({});

    await sendSms('+447700900123', 'hello');

    expect(atSendMock).toHaveBeenCalledWith({ to: ['+447700900123'], message: 'hello' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prefixes a missing + on the recipient (Twilio path)', async () => {
    configureTwilio();
    fetchMock.mockResolvedValue({ ok: true, status: 201 });

    await sendSms('447700900123', 'hello');

    const params = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
    expect(params.get('To')).toBe('+447700900123');
  });

  it('is best-effort: a Twilio failure never throws', async () => {
    configureTwilio();
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(sendSms('+447700900123', 'hello')).resolves.toBeUndefined();
  });

  it("is best-effort: an Africa's Talking failure never throws", async () => {
    atSendMock.mockRejectedValue(new Error('AT down'));

    await expect(sendSms('+447700900123', 'hello')).resolves.toBeUndefined();
  });
});
