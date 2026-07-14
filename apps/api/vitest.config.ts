import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests hit a real Postgres and run in a separate CI lane
    // (vitest.integration.config.ts); keep them out of the mocked unit run.
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
  },
});
