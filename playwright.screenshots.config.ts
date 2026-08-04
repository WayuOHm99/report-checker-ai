import { defineConfig, devices } from '@playwright/test'

// Screenshot capture is documentation work, not a quality gate, so it lives in
// its own config: `npm run verify` and CI must never depend on it, and a broken
// screenshot run must never be able to fail a release.
const port = Number(process.env.SCREENSHOT_PORT ?? 4174)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './scripts/screenshots',
  outputDir: './test-results/screenshots',
  timeout: 60_000,
  // One worker keeps the captures ordered and keeps the preview server quiet.
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    // Fixed viewport, fixed scale and fixed colour scheme: two runs of the same
    // commit have to produce the same pixels, otherwise the images stop being
    // evidence and become decoration.
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  },
  webServer: {
    // Same artefact the E2E suite uses: `vite preview` serves what `npm run
    // build` produced, so the screenshots show the bundle that actually ships.
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
