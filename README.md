# AI Report Check

เว็บหน้าเดียว React + TypeScript + Vite สำหรับช่วยตรวจความครบถ้วนของโครงงานและรายงานก่อนส่งให้อาจารย์ ระบบไม่ใช่ผู้ตัดสิน ไม่ตรวจลอกเลียนผลงาน และจำกัด MVP สำหรับผู้ใช้อายุ 18 ปีขึ้นไป

## เทคโนโลยี

- Frontend: React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- PDF: PDF.js (อ่าน text layer เท่านั้น ไม่มี OCR)
- API: Cloudflare Worker `POST /api/analyze`
- AI: Gemini ผ่าน `@google/genai`; API key อยู่ใน Worker Secret เท่านั้น
- Validation: Zod
- Rate limit/idempotency: Cloudflare KV
- Tests: Vitest, React Testing Library และ Playwright

## ติดตั้งและรันในเครื่อง

ต้องมี Node.js 24+ และ npm

```bash
npm install
copy .env.example .env
npm run dev
```

ค่าเริ่มต้น local ใช้ mock analysis และไม่ส่งรายงานออกจาก browser เปิด URL ที่ Vite แสดง ซึ่งปกติคือ `http://localhost:5173`

## คำสั่งตรวจสอบ

```bash
npm run lint
npm run test
npm run build
npm run worker:types
npm run worker:check
npm run test:e2e
```

E2E รันบน Chromium desktop, Chrome mobile, Firefox และ WebKit รวมการอัปโหลด PDF text layer ภาษาไทย, PDF ไม่มีข้อความ และ PDF หลายคอลัมน์

## พฤติกรรมสำคัญ

- รองรับเนื้อหารายงานหลักไม่เกิน 200,000 ตัวอักษร, ข้อความรวมภาคผนวกไม่เกิน 300,000 ตัวอักษร และ PDF ไม่เกิน 10 MB
- แสดงและแก้ไขข้อความจาก PDF ก่อนส่ง; PDF สแกนจะแจ้งเตือนและไม่ทำ OCR
- ตรวจพบภาคผนวก แสดงชื่อส่วนและจำนวนตัวอักษรที่ไม่นำไปวิเคราะห์ แล้วบังคับให้ผู้ใช้ยืนยัน
- ส่งเอกสารหลักให้ Gemini ครั้งเดียวเป็นค่าเริ่มต้น แบ่งเอกสารเฉพาะเมื่อ `countTokens` เกินขนาดจริง
- ตรวจ citation ด้วยกฎก่อนส่งเฉพาะ summary ให้ AI รองรับปี ค.ศ., พ.ศ. และช่วงเลขอ้างอิง เช่น `[1-3]`
- ผู้ใช้เลือกเทมเพลต เพิ่ม/ลบ/ปิดหัวข้อ แก้เกณฑ์และน้ำหนักได้ โดยค่าขั้นสูงถูกพับไว้ตามค่าเริ่มต้น
- คะแนนรวมคำนวณด้วยโค้ด หัวข้อปิดถูกตัดจากทั้งตัวเศษและตัวหาร
- AI ต้องส่ง rubric id ครบ ไม่ซ้ำ และตรงกับหัวข้อที่เปิด มิฉะนั้นระบบ retry JSON เพียง 1 ครั้ง
- มี progress โดยประมาณ, ป้องกันกดซ้ำ, timeout 2 นาที, cancel และ retry ด้วย idempotency key เดิม
- ร่างถูกเก็บเฉพาะ `sessionStorage` ของแท็บและมีคำเตือนก่อนออกจากหน้า ไม่มีการเก็บรายงานต้นฉบับบนเซิร์ฟเวอร์

## Worker local

ตั้ง secret สำหรับ Worker local/remote ผ่าน Wrangler และห้าม commit ค่า secret:

```bash
npx wrangler secret put GEMINI_API_KEY
```

ใช้ mock Worker ได้โดยตั้ง `MOCK_ANALYSIS=true` ห้ามใส่ Gemini key ในตัวแปรชื่อ `VITE_*`

## Production ที่มีอยู่

- Pages: https://report-checker-ai.pages.dev
- Worker: https://report-checker-ai-api.oomzazato01.workers.dev/api/analyze
- Model config: `gemini-3.6-flash`

โค้ดรอบนี้ยังไม่ deploy การเปลี่ยน Worker ต้องรัน `npm run worker:types` หลังแก้ binding/config และต้องได้รับการยืนยันก่อน deploy production

## ความเป็นส่วนตัวและความปลอดภัย

เนื้อหารายงานหลักถูกส่งไป Google Gemini ผ่าน Cloudflare Worker เมื่อผู้ใช้ยืนยันเท่านั้น Worker ไม่ log เนื้อหารายงาน ไฟล์ไม่ถูกอัปโหลด และผลสำเร็จอาจอยู่ใน KV ไม่เกิน 10 นาทีเพื่อป้องกันคำขอซ้ำ ดูรายละเอียดใน [SECURITY.md](SECURITY.md)
