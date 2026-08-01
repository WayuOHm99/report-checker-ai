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
```

## สิ่งที่มีใน Phase 1

- หน้า Single Page แบบ responsive สำหรับวางข้อความและเลือก PDF
- จำกัดข้อความ 200,000 ตัวอักษร และ PDF 10 MB ตั้งแต่หน้าเว็บ
- State flow: `idle`, `input`, `preview`, `editing`, `ready`, `analyzing`, `result`, `error`
- ต้องกดยืนยันเนื้อหาก่อนเริ่ม mock analysis
- UI สร้างด้วย Tailwind CSS และ shadcn/ui
- `.env.example` ไม่มี secret จริง

## ข้อจำกัดชั่วคราว

- ปุ่ม PDF ใน Phase 1 ตรวจ MIME/ขนาดและแสดงชื่อไฟล์เท่านั้น; การอ่าน text layer ด้วย PDF.js, preview และการเตือน PDF สแกนจะทำใน Phase 2
- mock response อยู่ใน `src/App.tsx`; จะย้ายไปเรียก `POST /api/analyze` ผ่าน Cloudflare Worker ใน Phase 5
- ยังไม่มี Worker, KV, Gemini credential หรือการ deploy และไม่มี Netlify ในโปรเจกต์

## ความเป็นส่วนตัวและขอบเขต

ระบบเป็นเครื่องมือช่วยตรวจเบื้องต้น ไม่ใช่ผู้ตัดสินแทนอาจารย์ และไม่อ้างว่าสามารถตรวจลอกเลียนผลงานได้ ระบบจริงจะส่งข้อมูลไปยัง Google Gemini ผ่าน Cloudflare Worker เท่านั้น และสำหรับผู้ใช้ 18 ปีขึ้นไป
