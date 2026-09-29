import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Integration tests share one Postgres database (hops_test): run files one at a time.
    fileParallelism: false,
  },
});
