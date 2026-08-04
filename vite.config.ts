import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // `e2e/` and `scripts/` hold Playwright specs. Vitest matches `*.spec.ts`
    // anywhere by default, and a Playwright spec loaded by Vitest fails the run
    // outright, so both directories stay out of the unit suite.
    exclude: ['e2e/**', 'scripts/**', 'node_modules/**', 'dist/**'],
  },
})
