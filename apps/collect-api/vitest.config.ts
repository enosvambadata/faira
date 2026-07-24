import { defineConfig, configDefaults } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Resolve @faira/api-core to source so per-test mocks of its internal deps apply.
  resolve: {
    alias: {
      '@faira/api-core': fileURLToPath(new URL('../../packages/api-core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
  },
});
