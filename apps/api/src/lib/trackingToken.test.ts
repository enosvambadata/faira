import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateTrackingToken, verifyTrackingToken } from './trackingToken';

const SHIPMENT_ID = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  process.env.TRACKING_TOKEN_SECRET = 'test-tracking-secret';
});

afterEach(() => {
  delete process.env.TRACKING_TOKEN_SECRET;
});

describe('trackingToken', () => {
  it('round-trips a shipment id through generate and verify', () => {
    const token = generateTrackingToken(SHIPMENT_ID);
    const verified = verifyTrackingToken(token);

    expect(verified).toEqual({ shipmentId: SHIPMENT_ID });
  });

  it('throws when generating without TRACKING_TOKEN_SECRET configured', () => {
    delete process.env.TRACKING_TOKEN_SECRET;

    expect(() => generateTrackingToken(SHIPMENT_ID)).toThrow();
  });

  it('fails closed (returns null, does not throw) verifying without TRACKING_TOKEN_SECRET configured', () => {
    const token = generateTrackingToken(SHIPMENT_ID);
    delete process.env.TRACKING_TOKEN_SECRET;

    expect(verifyTrackingToken(token)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = generateTrackingToken(SHIPMENT_ID);
    process.env.TRACKING_TOKEN_SECRET = 'a-different-secret';

    expect(verifyTrackingToken(token)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = generateTrackingToken(SHIPMENT_ID);
    const [, signature] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ shipmentId: 'someone-elses-id', exp: Date.now() + 1000000 })).toString('base64url');

    expect(verifyTrackingToken(`${forgedPayload}.${signature}`)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifyTrackingToken('not-a-valid-token')).toBeNull();
    expect(verifyTrackingToken('')).toBeNull();
    expect(verifyTrackingToken('a.b.c')).toBeNull();
  });

  it('rejects an expired token', () => {
    const realNow = Date.now;
    Date.now = () => new Date('2026-01-01T00:00:00Z').getTime();
    const token = generateTrackingToken(SHIPMENT_ID);
    Date.now = () => new Date('2027-01-01T00:00:00Z').getTime();

    expect(verifyTrackingToken(token)).toBeNull();
    Date.now = realNow;
  });
});
