import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 4173)
const baseURL = `http://127.0.0.1:${port}`
const isCi = Boolean(process.env.CI)
const reuseExistingServer = process.env.E2E_REUSE_SERVER === 'true'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: {
    // `vite preview` serves the artefact `npm run build` produced, so the suite
    // exercises the bundle that actually ships rather than a dev-server build.
    // Reuse is opt-in even locally: a stale Vite dev server must never stand in
    // for the production artefact just because it happens to own this port.
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !isCi && reuseExistingServer,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
