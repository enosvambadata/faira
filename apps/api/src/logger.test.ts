import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import pino from 'pino';
import { loggerOptions } from './logger';

// Builds a logger from the *production* options (loggerOptions) writing to an
// in-memory stream, so this exercises the real redaction config rather than a
// duplicate. The logged object mirrors the shape pino-http emits after its req
// serializer runs (req.headers.*), which is where auth tokens would otherwise
// leak into Railway logs / Sentry breadcrumbs.
function captureLog(logObject: Record<string, unknown>, msg: string): string {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  const testLogger = pino(loggerOptions, stream);
  testLogger.info(logObject, msg);
  return chunks.join('');
}

describe('logger redaction', () => {
  it('redacts Authorization, x-admin-token, and cookie request headers', () => {
    const raw = captureLog(
      {
        req: {
          method: 'GET',
          url: '/api/v1/admin/collect-uk/overview',
          headers: {
            authorization: 'Bearer supersecrettoken',
            'x-admin-token': 'adminsecretvalue',
            cookie: 'session=abc123',
            host: '127.0.0.1',
          },
        },
      },
      'request completed',
    );
    const line = JSON.parse(raw.trim().split('\n').filter(Boolean).pop() as string);

    // Sensitive headers are censored...
    expect(line.req.headers.authorization).toBe('[Redacted]');
    expect(line.req.headers['x-admin-token']).toBe('[Redacted]');
    expect(line.req.headers.cookie).toBe('[Redacted]');

    // ...and the raw secret values never appear anywhere in the output.
    expect(raw).not.toContain('supersecrettoken');
    expect(raw).not.toContain('adminsecretvalue');
    expect(raw).not.toContain('session=abc123');

    // Non-sensitive fields are unaffected.
    expect(line.req.method).toBe('GET');
    expect(line.req.url).toBe('/api/v1/admin/collect-uk/overview');
    expect(line.req.headers.host).toBe('127.0.0.1');
  });
});
