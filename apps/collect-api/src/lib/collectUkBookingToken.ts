import crypto from 'crypto';

// Signed, expiring, non-guessable stand-in for the raw booking id in
// public tracking links (SCRUM-180) -- guest customers have no account, so
// this is the only thing gating access to a booking's status. Mirrors
// lib/trackingToken.ts's shape exactly, but deliberately a separate module
// with its own env secret (COLLECT_UK_TRACKING_TOKEN_SECRET) rather than a
// shared/generic token system -- keeping Fulfilment and Collect UK's
// signing secrets independent means a bug in one product's token handling
// can never leak into the other's, same reasoning as keeping CompanyRole
// separate from UserRole (see the Collect UK ADR).
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

export function generateBookingTrackingToken(bookingId: string): string {
  const secret = getSecret();
  const payload = base64url(JSON.stringify({ bookingId, exp: Date.now() + TOKEN_TTL_MS }));
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

export function verifyBookingTrackingToken(token: string): { bookingId: string } | null {
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

  let parsed: { bookingId?: unknown; exp?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof parsed.bookingId !== 'string' || typeof parsed.exp !== 'number') return null;
  if (Date.now() > parsed.exp) return null;

  return { bookingId: parsed.bookingId };
}
