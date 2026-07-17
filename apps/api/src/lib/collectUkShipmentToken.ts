import crypto from 'crypto';

// Signed, expiring, non-guessable stand-in for a shipment recipient id in
// public transit-tracking links (SCRUM-220). Manually-added recipients have
// no account and no booking, so this is the only thing gating access to a
// shipment's milestone timeline. Mirrors collectUkBookingToken.ts exactly and
// shares its env secret (COLLECT_UK_TRACKING_TOKEN_SECRET) -- both are Collect
// UK public tracking tokens, so keeping them on one product secret is correct;
// the payload key (recipientId vs bookingId) keeps the two link types distinct.
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function getSecret(): string {
  const secret = process.env.COLLECT_UK_TRACKING_TOKEN_SECRET;
  if (!secret) {
    throw new Error('COLLECT_UK_TRACKING_TOKEN_SECRET is not configured');
  }
  return secret;
}

export function generateShipmentTrackingToken(recipientId: string): string {
  const secret = getSecret();
  const payload = base64url(JSON.stringify({ recipientId, exp: Date.now() + TOKEN_TTL_MS }));
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

export function verifyShipmentTrackingToken(token: string): { recipientId: string } | null {
  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;

  const expectedSignature = sign(payload, secret);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return null;
  }

  let parsed: { recipientId?: unknown; exp?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof parsed.recipientId !== 'string' || typeof parsed.exp !== 'number') return null;
  if (Date.now() > parsed.exp) return null;

  return { recipientId: parsed.recipientId };
}
