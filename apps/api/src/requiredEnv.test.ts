import { describe, it, expect } from 'vitest';
import { assertRequiredEnv } from './requiredEnv';

describe('assertRequiredEnv', () => {
  it('throws, naming the missing var, when COLLECT_UK_TRACKING_TOKEN_SECRET is unset', () => {
    expect(() => assertRequiredEnv({})).toThrow(/COLLECT_UK_TRACKING_TOKEN_SECRET/);
  });

  it('passes when all required vars are present', () => {
    expect(() => assertRequiredEnv({ COLLECT_UK_TRACKING_TOKEN_SECRET: 'a-secret' })).not.toThrow();
  });
});
