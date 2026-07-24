import crypto from 'crypto';

// Signed, expiring, non-guessable stand-in for the raw shipment id/reference
// in public tracking links (SCRUM-143) -- buyers have no account, so this is
// the only thing gating access to a shipment's status. Deliberately a plain
// HMAC rather than a JWT library: the payload is a single field plus an
// expiry, so a full JWT stack would be pure overhead.
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days -- long enough to outlast a slow buyer

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

// Throws rather than falling back to a default -- a tracking link signed
// with a guessable/default secret would be worse than no tracking link at
// all, so this fails closed the same way requireAdmin does for ADMIN_TOKEN.
function getSecret(): string {
  const secret = process.env.TRACKING_TOKEN_SECRET;
  if (!secret) {
    throw new Error('TRACKING_TOKEN_SECRET is not configured');
  }
  return secret;
}

export function generateTrackingToken(shipmentId: string): string {
  const secret = getSecret();
  const payload = base64url(JSON.stringify({ shipmentId, exp: Date.now() + TOKEN_TTL_MS }));
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

export function verifyTrackingToken(token: string): { shipmentId: string } | null {
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

  let parsed: { shipmentId?: unknown; exp?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof parsed.shipmentId !== 'string' || typeof parsed.exp !== 'number') return null;
  if (Date.now() > parsed.exp) return null;

  return { shipmentId: parsed.shipmentId };
}
