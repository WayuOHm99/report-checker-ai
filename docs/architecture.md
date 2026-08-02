# Architecture notes

เอกสารนี้สรุปการตัดสินใจทางเทคนิคที่สำคัญของ AI Report Check สำหรับใช้ประกอบ portfolio หรือ technical interview

## Components

### Frontend (`src/`)

- `App.tsx` เป็น workflow หลัก: input, PDF preview, rubric editor, analysis progress และ result review
- `src/lib/document.ts` เตรียม main text, ตรวจขนาด และแยก appendix
- `src/lib/pdf.ts` extract text layer พร้อม progress, abort และ warning สำหรับ scanned/multi-column PDF
- `src/lib/references.ts` ตรวจ citation/reference ด้วยกฎ deterministic ก่อนส่ง summary ให้ AI
- `src/lib/rubric.ts` เก็บ templates, schema และ validation ของหัวข้อ/น้ำหนัก
- `src/lib/analysis.ts` เก็บ response schema, mock result และการ format ผลตรวจ

### Worker (`worker/`)

- `POST /api/analyze` เป็น boundary เดียวระหว่าง browser กับ Gemini
- ตรวจ `Content-Type`, request size, idempotency key และ body schema ก่อนเรียก model
- ใช้ anonymous token + client IP ที่ hash แล้วสำหรับ cost-abuse guard
- ใช้ KV เก็บ counters และ successful idempotency response แบบ TTL สั้น
- เรียก model หลักและ fallback เมื่อ quota/model availability มีปัญหา
- ตรวจ AI response ด้วย schema และคำนวณ overall score ด้วยโค้ด

### Hosting

- Cloudflare Pages เสิร์ฟ static frontend และ security headers จาก `public/_headers`
- Cloudflare Worker เสิร์ฟ API แยกจาก static site
- `wrangler.jsonc` เก็บ non-secret production configuration
- `GEMINI_API_KEY` ต้องสร้างเป็น Worker Secret เท่านั้น

## Data flow

```text
User input
  -> browser validation
  -> PDF/text preparation
  -> appendix confirmation
  -> POST /api/analyze
  -> Worker validation + rate limit + idempotency
  -> Gemini structured response
  -> Worker schema validation
  -> browser score calculation
  -> explainable result cards
```

## Important design decisions

### Browser-first document review

ผู้ใช้เห็นและแก้ไขข้อความที่ extract จาก PDF ก่อนส่งเสมอ ระบบไม่ทำ OCR ใน MVP เพื่อไม่ทำให้ข้อมูลจากภาพถูกตีความโดยไม่มีการยืนยัน

### Code-owned scoring

โมเดลให้คะแนนรายหัวข้อและหลักฐาน ส่วนการคำนวณคะแนนรวมอยู่ในโค้ด ทำให้ตรวจสอบสูตร, enabled sections และ denominator ได้ deterministic

### Explicit appendix consent

เมื่อพบ appendix ระบบหยุดก่อน network request และแสดง accessible dialog ผู้ใช้เลือก “กลับไปแก้ข้อความ” หรือ “ยืนยันและส่งตรวจ” ได้อย่างชัดเจน

### Failure-aware API

ระบบรองรับ malformed JSON, schema mismatch, transient model failure, timeout, cancel, retry และ idempotency เพื่อป้องกัน double submission และผลลัพธ์ที่แสดงไม่ครบ

## Trade-offs and next steps

- KV เป็น eventually consistent; หากต้องการ rate limit แบบ atomic ระดับ production ควรย้าย counters ไป Durable Object
- progress ใน UI เป็น estimated progress ไม่ใช่ server-side streaming event
- MVP ใช้ text layer และไม่ทำ OCR
- ควรเพิ่ม token-cost telemetry และ budget alert ที่ผูกกับค่าใช้จ่ายจริงใน production
