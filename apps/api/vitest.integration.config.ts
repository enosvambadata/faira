import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Integration tests that run against a real Postgres (DATABASE_URL). Run in CI
// only, via the dedicated `integration` job with a Postgres service container.
export default defineConfig({
  resolve: {
    alias: {
      '@faira/api-core': fileURLToPath(new URL('../../packages/api-core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    // Serial: these touch a shared database.
    fileParallelism: false,
  },
});
