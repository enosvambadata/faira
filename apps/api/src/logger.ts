import pino from 'pino';

// Redaction is essential: pino-http's default req serializer logs req.headers
// verbatim, which includes the Supabase Bearer token on every authenticated
// request and x-admin-token on every admin call. Without this, those live
// credentials land in Railway logs / Sentry breadcrumbs in plaintext. Exported
// so the redaction config is unit-testable (see logger.test.ts).
export const loggerOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['req.headers.authorization', 'req.headers["x-admin-token"]', 'req.headers.cookie'],
    censor: '[Redacted]',
  },
};

export const logger = pino(loggerOptions);
