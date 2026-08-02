# Testing report

เอกสารนี้แยก **local verification** (สิ่งที่ยืนยันแล้วบนเครื่อง/CI จาก source ปัจจุบัน) ออกจาก **production verification** (สิ่งที่ยืนยันบน URL ที่ deploy แล้ว) อย่างชัดเจน เพราะทั้งสองอย่างตอบคำถามคนละข้อ

---

## Local verification

**สถานะ: ผ่านครบทุก automated quality gate**

รันล่าสุด: 2 สิงหาคม 2026 บน working tree ที่มี production-readiness hardening (idempotency digest, two-stage consolidation, N/A applicability, API version contract, PDF page limit)

| Layer | Command | Result |
| --- | --- | --- |
| Static analysis | `npm run lint` | passed |
| Unit/component | `npm run test` | 115/115 passed |
| Worker bundle + bindings | `npm run worker:check` | passed |
| Production dependency audit | `npm run audit:prod` | 0 vulnerabilities |
| Production build | `npm run build` | passed |
| Production-preview E2E | `npm run test:e2e` | 72/72 passed |

E2E รันบน artefact จาก `npm run build` ที่เสิร์ฟด้วย `vite preview` ไม่ใช่ dev server และครอบคลุม 4 projects: Chromium, Mobile Chrome (Pixel 5), Firefox, WebKit — 18 tests × 4 projects

### สิ่งที่ local suite ครอบคลุม

**Worker (`worker/src/index.test.ts`)**

- idempotency: replay ด้วย payload เดิม (ไม่เรียก AI ซ้ำ), payload ต่างกัน → 409 `IDEMPOTENCY_CONFLICT`, rubric เปลี่ยน → conflict, key order ไม่มีผลต่อ digest, malformed request อ่าน cache ไม่ได้, KV key เป็น hash, ไม่เก็บ report text ซ้ำ และแยก cache v0/v1
- multi-chunk consolidation: หลักฐานกระจายคนละ chunk, chunk ขัดแย้งกัน (ไม่เลือกคะแนนสูงสุด), หลักฐานซ้ำถูกยุบ, consolidation ล้มเหลว → `CONSOLIDATION_FAILED` ไม่ใช่คะแนนเงียบ ๆ, fallback model รันทั้ง chunk และ consolidation, consolidation prompt ไม่มีข้อความต้นฉบับ
- token budget: กันงบแบบ conservative ต่อ application-level call, consolidation ถูกกันงบ และ JSON validation retry นับ prompt ที่ยาวขึ้นเป็น call ที่สอง (ไม่ใช่ billing-accurate telemetry)
- N/A: น้ำหนักไม่เข้าตัวหาร, ทุกหัวข้อ N/A → `overallScore: null`, หลักฐานที่กุขึ้นถูกล้าง, response ที่ไม่มี `applicability` ถือเป็น applicable
- rate limit, CORS, appendix confirmation, rubric validation, Gemini error/fallback paths

**Frontend (`src/`)**

- สูตรคะแนนถ่วงน้ำหนักกับ N/A, `overallScore: null` vs 0% ที่ทำให้เข้าใจผิด
- API version contract: version header v1, explicit version ที่ไม่รองรับ → 426, compatibility response v0 exact สำหรับ Pages เดิม, cache แยกเวอร์ชัน, response รุ่นก่อน `apiVersion` → upgrade พร้อมแจ้งผู้ใช้, คะแนนรวม/score summary ที่ขัดกับหัวข้อ → ปฏิเสธ
- PDF page limit: เกิน limit หยุดก่อน extract, loading task ถูกคืน, ไฟล์ที่พอดี limit ยังอ่านได้
- UI: badge “ไม่เกี่ยวข้อง”, priority list ไม่รวม N/A, export/copy ระบุ N/A

**E2E (`e2e/`)**

- API contract แบบ mock route: documentType, rubric version, idempotency key และ API version headers, error response, retryable vs non-retryable, malformed response, incompatible apiVersion, N/A badge
- PDF page limit บน production build จริง
- flows เดิม: text analysis, empty state, responsive layout, Thai PDF text layer, scanned PDF warning, multi-column warning, appendix confirmation, document type switching

### Reproduce locally

```bash
npm ci
npx playwright install --with-deps
npm run verify
```

`npm run verify` รันชุดเดียวกับ CI ทั้งหมด หรือรันแยกทีละขั้น:

```bash
npm run lint
npm run test
npm run worker:check
npm run audit:prod
npm run test:e2e
```

อย่าใช้ข้อมูลรายงานจริงหรือข้อมูลส่วนบุคคลในการรัน test suite

---

## Production verification

**สถานะ: ยังไม่ได้ verify การเปลี่ยนแปลงรอบนี้บน production**

production ปัจจุบันยังเสิร์ฟ build รุ่นก่อนหน้า ยังไม่มีการ deploy Worker หรือ Pages สำหรับงาน hardening รอบนี้ จึงยัง **ไม่สามารถอ้างได้** ว่า TestSprite หรือการทดสอบใด ๆ บน production URL ยืนยันฟีเจอร์ใหม่ (idempotency conflict, consolidation, N/A scoring, apiVersion, PDF page limit)

- Live URL: [https://reportcheckxd.pages.dev/](https://reportcheckxd.pages.dev/)
- Repository: [WayuOHm99/report-checker-ai](https://github.com/WayuOHm99/report-checker-ai)

### TestSprite

TestSprite CLI ทดสอบเฉพาะ URL ที่ deploy แล้ว (ปฏิเสธ localhost) จึงต้องรันหลัง deploy ตามลำดับใน [deployment runbook](deployment-runbook.md)

Preflight ล่าสุด 2 สิงหาคม 2026 ผ่านแล้ว: CLI `0.4.0` และ credentials ใช้งานได้ แต่ยังไม่ได้รัน suite เพราะ source ปัจจุบันยังไม่ถูก deploy ไปยัง production URL

TestSprite project มี 10 scenarios ที่เขียนไว้สำหรับ UI รุ่นก่อน:

1. หน้าแรกและ empty state
2. short report warning
3. text report analysis และ result rendering
4. clear draft
5. document type และ rubric switching
6. advanced rubric editor
7. invalid rubric weight
8. appendix confirmation/cancel/confirm
9. privacy notice และ Google policy link
10. mobile viewport, overflow และ touch target dimensions

**Run ที่บันทึกไว้ด้านล่างเป็นผลของ build รุ่นก่อน hardening รอบนี้ ไม่ใช่หลักฐานของโค้ดปัจจุบัน:**

- [Appendix dialog — 5/5 steps passed](https://www.testsprite.com/dashboard/tests/c76aad7a-c7f9-44a8-a888-a842a4cd386e/test/4d532c92-e129-42bb-b8f3-51259d0f2c1d)
- [Mobile layout — 5/5 steps passed](https://www.testsprite.com/dashboard/tests/c76aad7a-c7f9-44a8-a888-a842a4cd386e/test/45c45e32-b274-438e-95e6-35cdca4114c7)

### หลัง deploy ต้องทำ

1. รัน TestSprite suite ที่เกี่ยวข้องทั้งหมดกับ production URL
2. เมื่อ failure ให้ดาวน์โหลด artifact มาตรวจก่อนแก้
3. อัปเดตหัวข้อนี้ด้วย run id, dashboard URL และเวลาที่รันจริง
4. เพิ่ม scenario ใหม่ที่ครอบคลุม N/A badge, ข้อความ API version mismatch และ PDF page limit ซึ่ง 10 scenarios เดิมยังไม่ครอบคลุม

---

## What is and is not certified

การทดสอบยืนยัน behavior ของ UI, validation, request flow, API contract และ failure paths ด้วยข้อมูลสังเคราะห์เท่านั้น

ไม่ได้ยืนยัน:

- ว่า AI ให้คะแนนรายงานจริงถูกต้องตามหลักวิชาการ
- ว่าการตัดสิน “ไม่เกี่ยวข้อง” ของโมเดลตรงกับดุลพินิจของอาจารย์ (ยังไม่มี ground-truth dataset)
- ว่าการรวมผลข้ามส่วนของเอกสารยาวแม่นยำเทียบกับการอ่านทั้งฉบับโดยมนุษย์
- plagiarism หรือ PDPA compliance
