import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { Webhook } from 'standardwebhooks';

const sendMock = vi.fn();

vi.mock('africastalking', () => ({
  default: vi.fn(() => ({ SMS: { send: sendMock } })),
}));

const HOOK_SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';

const { createApp } = await import('../app');

function signPayload(payload: object) {
  const wh = new Webhook(HOOK_SECRET);
  const body = JSON.stringify(payload);
  const id = 'msg-1';
  const timestamp = new Date();
  const signature = wh.sign(id, timestamp, body);
  return {
    body,
    headers: {
      'webhook-id': id,
      'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'webhook-signature': signature,
    },
  };
}

describe('POST /api/v1/webhooks/supabase/send-sms', () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ SMSMessageData: { Message: 'ok', Recipients: [] } });
    process.env.SUPABASE_SEND_SMS_HOOK_SECRET = HOOK_SECRET;
  });

  it('sends an SMS for a validly signed payload', async () => {
    const { body, headers } = signPayload({
      user: { phone: '263771234567' },
      sms: { otp: '123456' },
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/webhooks/supabase/send-sms')
      .set(headers)
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['+263771234567'],
        message: expect.stringContaining('123456'),
      }),
    );
  });

  it('rejects a payload with an invalid signature', async () => {
    const { body, headers } = signPayload({
      user: { phone: '263771234567' },
      sms: { otp: '123456' },
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/webhooks/supabase/send-sms')
      .set({ ...headers, 'webhook-signature': 'v1,not-a-real-signature' })
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_SIGNATURE');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns 500 if the hook secret is not configured', async () => {
    delete process.env.SUPABASE_SEND_SMS_HOOK_SECRET;
    const { body, headers } = signPayload({
      user: { phone: '263771234567' },
      sms: { otp: '123456' },
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/webhooks/supabase/send-sms')
      .set(headers)
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('CONFIG_ERROR');
  });
});
