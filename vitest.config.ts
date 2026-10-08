import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    environment: 'node',
    // Hosted macOS Intel runners are several times slower than a laptop; the budgets inside the tests are what matter.
    testTimeout: 30_000,
    hookTimeout: 60_000
  }
})
