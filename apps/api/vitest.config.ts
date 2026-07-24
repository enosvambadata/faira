import { defineConfig, configDefaults } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Resolve the workspace @faira/api-core to its SOURCE in tests, so vitest can
  // transform it and per-test mocks of its internal deps (e.g. africastalking
  // inside lib/sms) apply. Build + runtime still use the compiled dist.
  resolve: {
    alias: {
      '@faira/api-core': fileURLToPath(new URL('../../packages/api-core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests hit a real Postgres and run in a separate CI lane
    // (vitest.integration.config.ts); keep them out of the mocked unit run.
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
  },
});
