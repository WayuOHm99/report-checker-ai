# Architecture notes

เอกสารนี้สรุปการตัดสินใจทางเทคนิคที่สำคัญของ RubricLens สำหรับใช้ประกอบ portfolio หรือ technical interview

## Components

### Shared contract (`shared/`)

- `shared/api-contract.ts` เก็บ `API_VERSION`, รายการเวอร์ชันที่ client รองรับ และค่า `applicability` ที่ใช้ร่วมกันทั้งสองฝั่ง
- `shared/scoring.ts` เก็บสูตรคะแนนถ่วงน้ำหนักเพียงชุดเดียว ใช้ทั้งใน Worker และใน mock ของ browser จึงไม่มีสูตรซ้ำที่หลุดจากกัน
- `shared/document-types.ts` เก็บนิยามประเภทเอกสาร รวมถึงคำอธิบายว่าเมื่อใดหัวข้อจึงถือว่า “ไม่เกี่ยวข้อง” ตามธรรมชาติของงานแต่ละแบบ

### Frontend (`src/`)

- `App.tsx` เป็น workflow หลัก: input, PDF preview, rubric editor, analysis progress และ result review
- `src/lib/document.ts` เตรียม main text, แยก appendix และประกาศขีดจำกัดไฟล์ทั้งขนาด (10 MB) และจำนวนหน้า (400 หน้า) ไว้ที่เดียวกัน
- `src/lib/pdf.ts` extract text layer พร้อม progress, abort และ warning สำหรับ scanned/multi-column PDF และตรวจจำนวนหน้าทันทีหลังเปิดไฟล์ก่อนเริ่ม loop
- `src/lib/references.ts` ตรวจ citation/reference ด้วยกฎ deterministic ก่อนส่ง summary ให้ AI
- `src/lib/rubric.ts` เก็บ templates, schema และ validation ของหัวข้อ/น้ำหนัก
- `src/lib/analysis.ts` เก็บ response schema, การตรวจ `apiVersion`, mock result และการ format ผลตรวจ

### Worker (`worker/`)

- `POST /api/analyze` เป็น boundary เดียวระหว่าง browser กับ Gemini
- ตรวจ `Content-Type`, request size, idempotency key และ body schema **ก่อน** อ่าน cache หรือเรียก model
- ใช้ anonymous token + client IP ที่ hash แล้วสำหรับ cost-abuse guard
- ใช้ KV เก็บ counters และ successful idempotency response แบบ TTL สั้น
- เรียก model หลักและ fallback เมื่อ quota/model availability มีปัญหา
- ตรวจ AI response ด้วย schema **และคำนวณ overall score ด้วยโค้ดฝั่ง Worker**

## Where the score is calculated

นี่เป็นจุดที่มักเข้าใจผิด จึงระบุให้ชัด:

| เส้นทาง | ใครคำนวณ `overallScore` |
| --- | --- |
| Real API (`/api/analyze`) | **Cloudflare Worker** ด้วย `shared/scoring.ts` แล้วส่งค่าที่คำนวณแล้วกลับมา |
| Mock analysis ใน browser (`createMockAnalysis`) | **Browser** ด้วย `shared/scoring.ts` ตัวเดียวกัน ใช้เฉพาะตอน dev/mock เท่านั้น |

Browser ไม่ได้คำนวณคะแนนซ้ำจากผล API จริง แต่ตรวจ schema และ `apiVersion` ก่อนแสดงผล ส่วนการจัดลำดับ “สิ่งที่ควรแก้ก่อนส่ง” คำนวณใน browser จากหัวข้อที่เกี่ยวข้องเท่านั้น

## Data flow

```text
User input
  -> browser validation
  -> PDF/text preparation (page limit + size limit)
  -> appendix confirmation
  -> POST /api/analyze
  -> Worker validation (schema first)
  -> idempotency digest check
  -> rate limit + daily budget
  -> Gemini structured response (chunk pass, then consolidation pass เมื่อเอกสารยาว)
  -> Worker schema validation + applicability normalization
  -> Worker score calculation
  -> browser contract/version validation
  -> explainable result cards
```

## Important design decisions

### Browser-first document review

ผู้ใช้เห็นและแก้ไขข้อความที่ extract จาก PDF ก่อนส่งเสมอ ระบบไม่ทำ OCR ใน MVP เพื่อไม่ทำให้ข้อมูลจากภาพถูกตีความโดยไม่มีการยืนยัน

### Code-owned scoring with N/A support

โมเดลให้คะแนนรายหัวข้อและหลักฐาน ส่วนการคำนวณคะแนนรวมอยู่ในโค้ด ทำให้ตรวจสอบสูตร, enabled sections และ denominator ได้ deterministic

แต่ละหัวข้อมีฟิลด์ `applicability` เป็น `applicable` หรือ `not_applicable`:

- หัวข้อที่เป็น `not_applicable` จะไม่ถูกนับทั้งตัวตั้งและตัวหาร การตัดหัวข้อที่ไม่เกี่ยวข้องออกจึงไม่ทำให้คะแนนตก
- Worker บังคับล้าง `evidence`, `missing` และ `score` ของหัวข้อ N/A ทิ้ง เพื่อไม่ให้หลักฐานที่โมเดลกุขึ้นมาหลุดเข้าไปในผลของหัวข้อที่ถูกถอดออกจากการคิดคะแนน
- ถ้าทุกหัวข้อเป็น N/A ระบบคืน `overallScore: null` ไม่ใช่ `0` และ UI แสดงว่า “ไม่มีหัวข้อที่ใช้ประเมิน” เพราะงานที่ไม่มีหัวข้อให้ประเมินไม่ได้แปลว่าทำได้แย่
- ถ้าโมเดลไม่ส่ง `applicability` มา ระบบถือว่า `applicable` เพื่อให้พลาดไปในทางที่ปลอดภัย คือยังนับคะแนนแทนที่จะลบน้ำหนักออกเงียบ ๆ

### Two-stage analysis for long documents

เอกสารที่เกิน token limit ของการเรียกครั้งเดียวจะถูกแบ่งเป็นส่วน (ไม่เกิน 6 ส่วน) โดยไม่ตัดข้อความ แล้ววิเคราะห์สองขั้น:

1. **Chunk pass** — แต่ละส่วนถูกวิเคราะห์พร้อม `CHUNK_CONTEXT` ที่บอกว่ากำลังอ่านส่วนที่เท่าไรจากทั้งหมดกี่ส่วน
2. **Consolidation pass** — ส่ง **เฉพาะ structured findings** ของทุกส่วน (ตัดความยาวแล้ว) เข้าไปสรุปรวม ไม่ส่งข้อความต้นฉบับซ้ำอีกรอบ

ขั้นสรุปรวมประเมิน rubric ของทั้งเอกสาร รวมหลักฐานที่กระจายอยู่คนละส่วน และบันทึกความขัดแย้งข้ามบทลงใน `consistencyNotes` findings จาก chunk ถือเป็น untrusted data เช่นเดียวกับเอกสารต้นฉบับ

ระบบ **ไม่** ใช้วิธีเลือกคะแนนสูงสุดจาก chunk อีกต่อไป หากขั้นสรุปรวมล้มเหลว ระบบคืน `CONSOLIDATION_FAILED` อย่างชัดเจนแทนที่จะเงียบ ๆ แสดงคะแนนที่รวมมาแบบไม่ถูกต้อง

### Idempotency by request digest

- KV key เป็น SHA-256 ของ idempotency key ไม่ใช่ค่าดิบจาก client
- record ที่เก็บประกอบด้วย canonical request digest (SHA-256 ของ payload ที่ผ่าน validation แล้ว โดยเรียงคีย์คงที่) และ response ที่ serialize แล้ว
- key เดิม + payload เดิม → คืนผลเดิมโดยไม่เรียก AI ซ้ำ
- key เดิม + payload ต่างกัน → `409 IDEMPOTENCY_CONFLICT` (`retryable: false`) แทนที่จะคืนผลของเอกสารอื่น
- request ที่ malformed อ่าน cache ไม่ได้เลย เพราะ body ถูก validate ก่อนแตะ KV
- เก็บเฉพาะ digest ไม่ได้เก็บ `reportText` เพิ่มจาก response ที่ต้องเก็บอยู่แล้ว

### Token budget accounting

ก่อน application-level model call แต่ละครั้ง ระบบกันงบแบบ conservative โดยใช้ `countTokens` กับ prompt จริงและบังคับ `maxOutputTokens` ตามจำนวนหัวข้อใน rubric การกันงบจึงครอบคลุม chunk pass, consolidation pass, JSON validation retry และการรันซ้ำบน fallback model แยกกัน แต่ไม่ใช่ยอด billing จริงและมองไม่เห็น retry ภายใน SDK

Gemini 3 ใช้ `thinkingLevel: low` สำหรับงาน rubric ที่เป็น constrained instruction-following เพื่อลด latency และเหลือ generation allowance ให้ JSON ครบภายใน timeout ของ browser

### API versioning

`apiVersion` เป็นค่าคงที่ที่ Worker ประทับบน `/api/health` และผล v1 ของ `/api/analyze` ส่วน request v1 ระบุ `X-RubricLens-Api-Version: 1`

- Browser ปฏิเสธเวอร์ชันที่ไม่รู้จักและบอกผู้ใช้ให้รีเฟรช แทนที่จะ parse บางส่วนแล้วรายงานคะแนนผิด
- response รุ่นก่อนที่ยังไม่มี `apiVersion` ถูก parse ด้วย schema แยกต่างหากสำหรับช่วง rolling deployment แล้ว upgrade อย่างชัดเจน (ทุกหัวข้อเป็น `applicable`) พร้อมเพิ่ม quality warning ให้ผู้ใช้เห็นว่าผลมาจากเซิร์ฟเวอร์รุ่นก่อน ไม่ใช่ซ่อนความต่างไว้
- compatibility Worker ตรวจ client รุ่นเดิมจากการไม่มี version header แล้วคืน v0 shape แบบ exact; cache idempotency แยกตาม API version เพื่อไม่ให้ response ข้าม contract
- frontend คำนวณคะแนนและ summary ซ้ำเพื่อยืนยันความสอดคล้องก่อนแสดงผล และปฏิเสธ N/A ที่ยังมีคะแนน หลักฐาน หรือรายการที่ขาด

### Explicit appendix consent

เมื่อพบ appendix ระบบหยุดก่อน network request และแสดง accessible dialog ผู้ใช้เลือก “กลับไปแก้ข้อความ” หรือ “ยืนยันและส่งตรวจ” ได้อย่างชัดเจน

### Resource guards on PDF input

ไฟล์ PDF ถูกจำกัดทั้งขนาด (10 MB) และจำนวนหน้า (400 หน้า) เพราะไฟล์เล็กมากก็สามารถมีหลายพันหน้าได้ และการ extract ทำงานหน้าละหนึ่งรอบบน main thread ระบบตรวจจำนวนหน้าทันทีหลังเปิดเอกสารก่อนเริ่ม loop และยังคืน loading task เสมอผ่าน `finally`

### Failure-aware API

ระบบรองรับ malformed JSON, schema mismatch, transient model failure, timeout, cancel, retry, idempotency conflict, consolidation failure และ API version mismatch เพื่อป้องกัน double submission และผลลัพธ์ที่แสดงไม่ครบ

## Trade-offs and next steps

- KV เป็น eventually consistent; หากต้องการ rate limit แบบ atomic ระดับ production ควรย้าย counters ไป Durable Object
- progress ใน UI เป็น estimated progress ไม่ใช่ server-side streaming event
- MVP ใช้ text layer และไม่ทำ OCR
- consolidation pass เพิ่มการเรียก model หนึ่งครั้งต่อเอกสารยาว แลกกับความถูกต้องของคะแนนรวม
- ควรเพิ่ม token-cost telemetry และ budget alert ที่ผูกกับค่าใช้จ่ายจริงใน production
- คุณภาพของการรวมผลข้ามส่วนขึ้นกับคุณภาพของ findings จาก chunk pass ซึ่งยังไม่มี ground-truth dataset วัดผลอย่างเป็นระบบ
