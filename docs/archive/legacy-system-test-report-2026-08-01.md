# รายงานตรวจสอบระบบช่วยตรวจโครงงานและรายงานด้วย AI

วันที่ตรวจ: 1 สิงหาคม 2026  
โปรเจกต์: `rubriclens-ai`
Commit ที่ตรวจ: `461212b` (`feat: migrate to Gemini 3.6 Flash`)  
Git remote: `https://github.com/WayuOHm99/rubriclens-ai.git`

## 1. วัตถุประสงค์

ตรวจสอบความพร้อมของ Web App สำหรับรับข้อความ/ไฟล์ PDF ตรวจรูบริกและเอกสารอ้างอิงเบื้องต้น ส่งข้อมูลผ่าน Cloudflare Worker ไปยัง Gemini และแสดงคะแนนแบบแยกรายหัวข้อ

ผลตรวจนี้เป็นรายงานทางเทคนิค ไม่ใช่การรับรองความถูกต้องของคะแนน AI หรือการรับรองความสอดคล้องตามกฎหมาย PDPA

## 2. ขอบเขตระบบที่พบ

- Frontend: React, TypeScript, Vite, Tailwind CSS และ shadcn/ui
- Hosting/API ที่ตั้งใจใช้: Cloudflare Pages และ Cloudflare Workers
- Storage: Cloudflare KV สำหรับ rate limit และ idempotency ชั่วคราว
- AI client: `@google/genai`
- PDF: PDF.js สำหรับ text layer
- Validation: Zod
- Test tooling: Vitest, Playwright และ oxlint
- GitHub repository เชื่อมกับ `origin/main`

## 3. ฟังก์ชันที่พบในโค้ด

### Frontend

- Single-page workflow
- วางข้อความรายงาน
- อัปโหลด PDF ไม่เกิน 10 MB
- ดึง text layer และแสดง preview ก่อนตรวจ
- แจ้งเตือน PDF สแกนที่ไม่มี text layer โดย MVP ยังไม่ทำ OCR
- จำกัดข้อความประมาณ 200,000 ตัวอักษรและไม่ตัดเงียบ
- เทมเพลตรูบริกและรูบริกกำหนดเอง
- เพิ่ม ลบ เปิด/ปิด และแก้ไขหัวข้อ/น้ำหนัก
- ตรวจ citation และรายการอ้างอิงด้วยกฎเบื้องต้น
- แสดง progress, ปุ่มยกเลิก และป้องกันการกดซ้ำ
- ใช้ anonymous token และ idempotency key
- แสดง disclaimer ว่าเป็นเครื่องมือช่วยตรวจเบื้องต้น

### Worker

- `POST /api/analyze`
- ตรวจ Content-Type, request size, idempotency key และ request schema
- ตรวจความยาวรายงาน
- ตรวจรูบริกที่เปิดใช้งานและน้ำหนักมากกว่า 0
- rate limit ตาม IP และ anonymous token เมื่อมี KV
- mock mode สำหรับพัฒนา
- เรียก Gemini ในโหมดจริง
- structured JSON output และ Zod validation
- retry ผล JSON ที่ไม่ผ่านหนึ่งครั้ง
- คำนวณคะแนนรวมด้วยโค้ด
- ไม่เขียนเนื้อหารายงานลง log โดยเจตนา
- CORS จำกัดตาม `ALLOWED_ORIGIN`

## 4. ผลการตรวจคำสั่งอัตโนมัติ

| รายการ | ผล | หมายเหตุ |
|---|---|---|
| `npx tsc -b --pretty false` | ผ่าน | TypeScript compile ผ่าน |
| `npm run lint` | ผ่านแบบมีคำเตือน | พบคำเตือน Fast Refresh 2 จุดใน UI components |
| `npm run test` | ยังยืนยันไม่ได้ | Vitest เริ่มไม่ได้เพราะโหลด native Tailwind Oxide ไม่สำเร็จและพบ `spawn EPERM` ก่อนเริ่ม test |
| `npm run build` | ยังยืนยันไม่ได้ | `tsc` ผ่าน แต่ Vite build ถูกบล็อกด้วยปัญหา native Tailwind Oxide/`spawn EPERM` |
| `npm run worker:types` | ยังยืนยันไม่ได้ | Wrangler ถูกบล็อกด้วย `spawn EPERM` |
| `npm run worker:check` | ยังยืนยันไม่ได้ | Wrangler dry-run ถูกบล็อกด้วย `spawn EPERM` |
| `npm run test:e2e` | ยังไม่ได้รัน | ต้องแก้ปัญหา dev/build ก่อน |
| `git status` | ผ่าน | working tree สะอาด และ branch ตรงกับ `origin/main` |

คำว่า “ยังยืนยันไม่ได้” หมายถึงสภาพแวดล้อมไม่สามารถรันคำสั่งได้ ไม่ได้แปลว่าโค้ดส่วนนั้นผ่านการทดสอบแล้ว

## 5. รายการที่ต้องแก้หรือยืนยันก่อนเปิดให้ผู้ใช้จริง

### P0 — ต้องตรวจทันที

1. **พารามิเตอร์ Gemini รุ่น 3.6**

   ระบบตั้ง `GEMINI_MODEL=gemini-3.6-flash` แต่ `callGemini()` ยังส่ง `temperature: 0` อยู่ เอกสาร Gemini รุ่นล่าสุดระบุว่า sampling parameters เช่น `temperature`, `top_p` และ `top_k` ถูกเลิกใช้กับรุ่นใหม่และอาจทำให้คำขอในอนาคตตอบกลับ 400 ได้ [Gemini latest models](https://ai.google.dev/gemini-api/docs/latest-model)

   ต้องตัดสินใจให้ชัดว่าจะ:

   - ใช้ Gemini 3.6 Flash แล้วเอา `temperature` ออกและทดสอบ structured output ใหม่ หรือ
   - pin กลับไปยังรุ่นที่รองรับการตั้งค่าเดิม

2. **ยืนยันโมเดลในเอกสารกับการตั้งค่าจริง**

   README และ `wrangler.jsonc` ระบุ Gemini 3.6 Flash ขณะที่สเปกก่อนหน้าระบุ Gemini 2.5 Flash ต้องเลือกชื่อรุ่นเดียวและบันทึกเหตุผล/ราคาที่ถูกต้องให้ตรงกันทั้งระบบ

### P1 — ต้องทำก่อน production

3. **ยืนยัน Worker Secret และ KV จริง**

   `wrangler.jsonc` ตั้ง `MOCK_ANALYSIS=false` ดังนั้น deployment จริงต้องมี `GEMINI_API_KEY` และ KV binding ที่ใช้งานได้ ไม่เช่นนั้นระบบจะวิเคราะห์ไม่ได้หรือหยุดด้วยข้อผิดพลาด 503/502

4. **Privacy และอายุ 18 ปีเป็นเพียงข้อความแจ้ง**

   หน้าเว็บยังไม่มี checkbox ยอมรับ Privacy Notice และไม่มี age gate ที่ผู้ใช้ต้องยืนยันก่อนส่งข้อมูลจริง ขณะนี้เป็นเพียง card ข้อความ จึงยังไม่ตรงกับข้อกำหนดการยืนยันก่อนใช้งานจริง

5. **ตรวจสอบผลลัพธ์ AI ให้ตรงกับรูบริก**

   Worker ตรวจ schema ของแต่ละรายการ แต่ยังไม่ได้บังคับว่า `id` ของผลลัพธ์ต้องตรงกับหัวข้อที่ส่งไปและไม่มีรายการซ้ำ ระบบจะเติมหัวข้อที่หายด้วยคะแนน 0 ซึ่งอาจทำให้คะแนนต่ำโดยไม่แจ้งว่า AI ส่งผลไม่ครบ

6. **Rate limit แบบ KV ยังไม่ atomic**

   การนับใช้ลำดับ `get` แล้ว `put` จึงมีโอกาสถูกคำขอพร้อมกันแทรกและข้ามเพดานได้ ควรถือเป็น rate limit แบบ best-effort หรือเปลี่ยนเป็น primitive ที่รองรับการนับแบบ atomic ก่อนเปิดสาธารณะ

7. **งบรายวันนับจำนวน request ไม่ใช่ต้นทุน token**

   `DAILY_BUDGET_LIMIT=100` จำกัดจำนวนคำขอ ไม่ได้จำกัดค่าใช้จ่ายจริงตาม input/output/thinking tokens ควรบันทึก token usage จาก Gemini และตั้ง budget control ตามต้นทุนจริง

### P2 — ควรปรับปรุง

8. **Progress ปัจจุบันเป็น client-side timer**

   สถานะ “นับ token” และ “AI กำลังวิเคราะห์” เป็นลำดับที่หน้าเว็บเลื่อนเอง ไม่ใช่ event ที่ Worker รายงานจริง ควรใช้คำว่า “ขั้นตอนการประมวลผลโดยประมาณ” หรือเพิ่ม telemetry เมื่อมีระบบจริง

9. **Timeout 45 วินาทีอาจสั้นสำหรับรายงานยาว**

   ควรทดสอบกับรายงานภาษาไทยขนาดใหญ่และปรับ timeout/สถาปัตยกรรมหาก Gemini ใช้เวลานานกว่านี้

10. **Env type ถูกเขียนซ้ำใน `worker/src/index.ts`**

   โค้ดมี `Env` interface แบบเขียนเอง ทั้งที่สร้าง `worker/env.d.ts` ด้วย Wrangler แล้ว แนวทางของ Cloudflare แนะนำให้ใช้ type ที่ generate จาก Wrangler เพื่อป้องกัน binding/config ไม่ตรงกัน [Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)

11. **เอกสารระบุ URL production แต่ยังไม่ได้ยืนยันจากการตรวจครั้งนี้**

   README มี Pages URL และ Worker URL แต่คำสั่ง local ที่ใช้ตรวจไม่สามารถยืนยัน endpoint ภายนอกได้ ต้องตรวจด้วย browser/HTTP smoke test หลังยืนยัน deployment และ secret จริง

## 6. เกณฑ์รับรองก่อนเปิดใช้งาน

- `npm run test` ผ่านทั้งหมด
- `npm run build` ผ่าน
- `npm run test:e2e` ผ่านใน browser จริง
- `npm run worker:check` ผ่าน
- ยืนยัน Gemini model และ parameter ที่รองรับแล้ว
- ตั้ง Worker Secret โดยไม่ commit key
- ยืนยัน KV namespace และ rate limit ใน environment ที่จะใช้จริง
- ทดสอบรายงานภาษาไทย, PDF text layer และ PDF สแกน
- ทดสอบข้อความเกิน 200,000 ตัวอักษรโดยไม่ตัดเงียบ
- ทดสอบ prompt injection
- ทดสอบ JSON ผิดและ retry 1 ครั้ง
- ทดสอบการกดซ้ำ, timeout, cancel และ 429
- เพิ่ม checkbox Privacy Notice และ age gate ก่อนส่งข้อมูลจริง
- ตรวจว่า log ไม่มีเนื้อหารายงาน
- ตั้ง budget alert และเพดานต้นทุนจริง

## 7. สรุปสถานะ

**สถานะปัจจุบัน: ผ่านระดับโครงสร้าง MVP แต่ยังไม่ผ่านการรับรอง production**

ระบบมีองค์ประกอบหลักของ Web App และเส้นทาง API ครบ แต่ยังต้องแก้/ยืนยัน P0–P1 และแก้ปัญหาสภาพแวดล้อมที่ทำให้ test, build และ Wrangler verification รันไม่จบ ก่อนประกาศว่า “พร้อมใช้จริง”

## 8. แผนแก้ไขที่แนะนำ

1. เลือกและ pin Gemini model ให้ตรงกับเอกสาร พร้อมปรับ sampling parameters
2. แก้ environment/test runner ที่ทำให้ native dependency และ Wrangler เจอ `spawn EPERM`
3. รัน unit, build, Worker dry-run และ E2E ใหม่
4. เพิ่มการตรวจ section IDs/duplicates และ age/privacy confirmation
5. ตั้งค่า Secret/KV ใน Cloudflare แล้วทำ real API smoke test ด้วยข้อมูลทดสอบที่ไม่ sensitive
6. อัปเดต README เป็นผลตรวจจริงและบันทึก commit สำหรับ release candidate
