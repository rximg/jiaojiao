import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    watch: false,
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup/env.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    poolOptions: {
      threads: {
        isolate: true,
      },
    },
  },
});
