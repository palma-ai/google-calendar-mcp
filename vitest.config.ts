import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true, // Use Vitest globals (describe, it, expect) like Jest
    environment: 'node', // Specify the test environment
    include: ['src/**/*.test.ts'],
    // If using ESM, ensure module resolution is handled correctly
    // You might not need alias if your tsconfig paths work, but it can be explicit:
    // alias: {
    //   '^(\\.{1,2}/.*)\\.js$': '$1',
    // },
    // Enable coverage
    coverage: {
      provider: 'v8', // or 'istanbul'
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.config.ts',
        '**/types.ts',
      ],
    },
  },
}) 