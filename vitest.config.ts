import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}', 'packages/server/src/**/*.test.{ts,tsx}', 'packages/shared/src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/index.ts', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'packages/shared/src'),
      '@server': path.resolve(__dirname, 'packages/server/src'),
      '@web': path.resolve(__dirname, 'packages/web/src'),
    },
  },
});
