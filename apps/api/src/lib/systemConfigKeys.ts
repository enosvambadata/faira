// Shared SystemConfiguration key names — a single source of truth so the
// seed script and the routes that read these values can't drift apart on
// a typo'd key string.
export const SYSTEM_CONFIG_KEYS = {
  DECLARED_VALUE_LIMIT_UNVERIFIED: 'declared_value_limit_unverified',
  DECLARED_VALUE_LIMIT_VERIFIED: 'declared_value_limit_verified',
} as const;
