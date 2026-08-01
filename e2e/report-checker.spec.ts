import { expect, test } from '@playwright/test'

test('a user confirms text before viewing mock analysis results', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('ข้อความรายงาน').fill('บทนำ\nรายงานทดสอบสำหรับ browser smoke test')
  await page.getByRole('button', { name: 'ตรวจสอบและดูตัวอย่าง' }).click()
  await page.getByRole('button', { name: 'ยืนยันเนื้อหา' }).click()
  await page.getByRole('button', { name: 'เริ่มตรวจด้วย Mock AI' }).click()
  await expect(page.getByRole('region', { name: 'ผลวิเคราะห์' })).toBeVisible()
  await expect(page.getByText('AI อาจคลาดเคลื่อน')).toBeVisible()
})
