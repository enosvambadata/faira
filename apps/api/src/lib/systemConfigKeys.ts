// Shared SystemConfiguration key names — a single source of truth so the
// seed script and the routes that read these values can't drift apart on
// a typo'd key string.
export const SYSTEM_CONFIG_KEYS = {
  DECLARED_VALUE_LIMIT_UNVERIFIED: 'declared_value_limit_unverified',
  DECLARED_VALUE_LIMIT_VERIFIED: 'declared_value_limit_verified',
  SHIPMENT_QUOTE_FALLBACK_FEE: 'shipment_quote_fallback_fee',
  SHIPMENT_DROPOFF_DEADLINE_HOURS: 'shipment_dropoff_deadline_hours',
  COLLECTION_CODE_EXPIRY_DAYS: 'collection_code_expiry_days',
  MANIFEST_RECONCILIATION_THRESHOLD_HOURS: 'manifest_reconciliation_threshold_hours',
} as const;
