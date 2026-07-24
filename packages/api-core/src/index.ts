// @faira/api-core — the shared, dependency-light server foundation every product
// API imports: error types + handler, logging, config assertions, and the
// SMS/email/cloudinary/escapeHtml transports. Intentionally free of prisma /
// supabase / auth so it never collides with per-app test mocks (those stay in
// each app: requireAuth, requireAdmin, fulfilmentAuditLog).
export * from './errors/ApiError';
export * from './errors/errorHandler';
export * from './logger';
export * from './requiredEnv';
export * from './lib/sms';
export * from './lib/email';
export * from './lib/cloudinary';
export * from './lib/escapeHtml';
export * from './lib/deliveryResult';
