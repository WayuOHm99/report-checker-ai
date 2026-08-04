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
  build: {
    rollupOptions: {
      // เว็บนี้มีสามหน้า: หน้าตรวจเอกสาร นโยบายความเป็นส่วนตัว และข้อกำหนดการใช้งาน
      // แต่ละหน้าต้องมีไฟล์ .html ของตัวเองที่นี่ ไม่งั้น Vite จะ build แค่ index.html
      // ชื่อไฟล์คือชื่อ URL ที่ได้ (privacy.html -> /privacy บน Cloudflare Pages)
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        privacy: path.resolve(import.meta.dirname, 'privacy.html'),
        terms: path.resolve(import.meta.dirname, 'terms.html'),
      },
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
