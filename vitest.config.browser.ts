import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/browser/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],

    // Browser mode with happy-dom (lightweight, no real browser needed)
    environment: 'happy-dom',

    // Or use real browser with Playwright:
    // browser: {
    //   enabled: true,
    //   provider: 'playwright',
    //   name: 'chromium',
    // },

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['src/browser/**/*.ts'],
    },
  },
});
