import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // DB 통합 테스트 병렬 실행 시 연결 경쟁으로 타임아웃 발생 방지
    testTimeout: 15000,
    // 동시 실행 파일 수 제한 — DB 연결 풀 고갈 방지
    pool: 'forks',
    poolOptions: {
      forks: { maxForks: 4 },
    },
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
