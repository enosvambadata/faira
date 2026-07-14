import { defineConfig } from 'vitest/config';

// Integration tests that run against a real Postgres (DATABASE_URL). Run in CI
// only, via the dedicated `integration` job with a Postgres service container.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    // Serial: these touch a shared database.
    fileParallelism: false,
  },
});
