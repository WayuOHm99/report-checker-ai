# AI Report Check (MVP)

หน้าเว็บ React + TypeScript + Vite สำหรับช่วยตรวจโครงสร้างรายงานเบื้องต้น โดย Phase 1 ใช้ mock analysis response เท่านั้น และไม่มีการเรียก Gemini หรือส่งรายงานออกจาก browser

## ข้อกำหนด

- Node.js 24+ และ npm
- ไม่ต้องมี Gemini API key สำหรับการรัน Phase 1

## ติดตั้งและรันในเครื่อง

```bash
npm install
copy .env.example .env
npm run dev
```

เปิด URL ที่ Vite แสดง (ปกติ `http://localhost:5173`)  

## คำสั่งตรวจสอบ

```bash
npm run test
npm run build
npm run worker:check
```

## สิ่งที่มีใน Phase 1

- หน้า Single Page แบบ responsive สำหรับวางข้อความและเลือก PDF
- จำกัดข้อความ 200,000 ตัวอักษร และ PDF 10 MB ตั้งแต่หน้าเว็บ
- State flow: `idle`, `input`, `preview`, `editing`, `ready`, `analyzing`, `result`, `error`
- ต้องกดยืนยันเนื้อหาก่อนเริ่ม mock analysis
- UI สร้างด้วย Tailwind CSS และ shadcn/ui
- `.env.example` ไม่มี secret จริง
- รูบริกเริ่มต้นปรับเทมเพลต เกณฑ์ น้ำหนัก และสถานะเปิด/ปิดหัวข้อได้
- ตรวจ citation และรายการอ้างอิงท้ายเล่มด้วย regex/กฎเบื้องต้น โดยระบุผลว่าให้ผู้ใช้ยืนยันเสมอ
- Cloudflare Worker มี `POST /api/analyze` แบบ mock พร้อม request validation, idempotency, rate-limit/KV design และคำนวณคะแนนรวมด้วยโค้ด
- หน้าแสดงผลมีคะแนนรวมและผลรายหัวข้อ พร้อมเหตุผล หลักฐาน สิ่งที่ขาด คำแนะนำ confidence ความสอดคล้อง และคำเตือนอ้างอิง

## ข้อจำกัดชั่วคราว

- PDF.js ดึง text layer จาก PDF และเปิดให้ตรวจ/แก้ไขข้อความก่อนยืนยัน; PDF สแกนที่ไม่มี text layer จะแจ้งเตือน โดย MVP จะไม่ทำ OCR
- mock response อยู่ใน `src/App.tsx`; จะย้ายไปเรียก `POST /api/analyze` ผ่าน Cloudflare Worker ใน Phase 5
- Worker ยังทำงานแบบ mock เพราะไม่มี Gemini credential และ KV namespace จริง; ห้าม deploy จนกว่าจะแทนที่ KV placeholder และตั้ง Worker Secret `GEMINI_API_KEY`

## ความเป็นส่วนตัวและขอบเขต

ระบบเป็นเครื่องมือช่วยตรวจเบื้องต้น ไม่ใช่ผู้ตัดสินแทนอาจารย์ และไม่อ้างว่าสามารถตรวจลอกเลียนผลงานได้ ระบบจริงจะส่งข้อมูลไปยัง Google Gemini ผ่าน Cloudflare Worker เท่านั้น และสำหรับผู้ใช้ 18 ปีขึ้นไป
