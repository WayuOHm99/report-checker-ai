# Testing report

รายงานนี้แยกผลตรวจ local/CI ออกจาก production เพื่อให้ตรวจสอบย้อนกลับได้ว่าทดสอบ source และ deployment ใด

## Local verification

**สถานะ: ผ่าน automated quality gates ทั้งหมด**

### รอบล่าสุด — 4 สิงหาคม 2026 (หลังจัดโครงสร้าง repo สำหรับ portfolio)

รันบน Node.js 24 บน working tree ปัจจุบัน หลังย้าย `@/components/ui` เข้า `src/components/ui`
และเพิ่มสคริปต์เก็บภาพหน้าจอ

| Layer | Command | Result |
| --- | --- | --- |
| Static analysis | `npm run lint` | passed |
| Unit/component | `npm run test` | 115/115 passed |
| Worker bundle and bindings | `npm run worker:check` | passed |
| Production dependency audit | `npm run audit:prod` | passed (ไม่มี high/critical) — มี moderate ค้าง 1 รายการ |
| Production build | `npm run build` | passed |
| Production-preview E2E | `npm run test:e2e` | 72/72 passed |

**รายการ moderate ที่ค้างอยู่:** `hono@4.12.33` มีช่องโหว่ ReDoS ใน CORS middleware
([GHSA-8j4g-w8fx-2239](https://github.com/advisories/GHSA-8j4g-w8fx-2239)) ติดมาทางอ้อมผ่าน
`@google/genai` → `@modelcontextprotocol/sdk` ซึ่งเป็นเส้นทางที่โปรเจกต์นี้ไม่ได้เรียกใช้
ด่าน `audit:prod` ตั้งเกณฑ์ไว้ที่ high จึงไม่ทำให้ CI แดง — **ยังไม่ได้แก้ และยังไม่ได้ตัดสินใจว่าจะอัปเดตเมื่อไร**

`npm ci` ในสำเนาสะอาดยังไม่ได้รันซ้ำในรอบนี้ ผลด้านล่างของวันที่ 2 สิงหาคม 2026 จึงยังเป็นหลักฐานล่าสุดของขั้นนั้น

### รอบก่อนหน้า — 2 สิงหาคม 2026

ตรวจด้วย Node.js 24 บน working tree ที่มี production hardening รอบนั้น

| Layer | Command | Result |
| --- | --- | --- |
| Install from lockfile | `npm ci` | passed in a clean copy |
| Static analysis | `npm run lint` | passed |
| Unit/component | `npm run test` | 115/115 passed |
| Worker bundle and bindings | `npm run worker:check` | passed |
| Production dependency audit | `npm run audit:prod` | 0 vulnerabilities |
| Production build | `npm run build` | passed |
| Production-preview E2E | `npm run test:e2e` | 72/72 passed |

E2E ใช้ artefact จาก `npm run build` ผ่าน `vite preview` ครอบคลุม Chromium, Mobile Chrome (Pixel 5), Firefox และ WebKit รวม 18 tests × 4 projects ไม่ได้ใช้ dev server

ขอบเขตสำคัญที่ชุดทดสอบครอบคลุม:

- Worker: idempotency digest/conflict, v0/v1 cache separation, rate limits, CORS, Gemini retry/fallback, two-stage consolidation และ token-budget reservation
- Scoring: N/A ไม่เข้าตัวตั้งหรือตัวหาร, ทุกหัวข้อเป็น N/A ได้ `overallScore: null` และล้าง fabricated evidence
- API contract: version negotiation, exact legacy response, response/rubric/document-type integrity และ malformed/incompatible responses
- Documents/UI: PDF 400-page limit, cancellation/cleanup, appendix confirmation, responsive layout, document-type switching, export/copy และ N/A presentation

รันซ้ำได้ด้วย:

```bash
npm ci
npx playwright install --with-deps
npm run verify
```

ใช้เฉพาะข้อมูลสังเคราะห์ในการทดสอบ ห้ามใช้รายงานจริงหรือข้อมูลส่วนบุคคล

## Production verification

**สถานะ: deploy และตรวจ production ผ่านแล้วเมื่อ 2 สิงหาคม 2026**

- Live URL: [https://rubriclensai.pages.dev/](https://rubriclensai.pages.dev/)
- Pages verified deployment: `14368c90-9372-4d64-bcd5-95f3715b40ed`
- Pages source: current `main` rebrand build
- Worker version: `e2d10195-982c-45d0-89e6-bf2fa68076d9`
- Worker health: API v0/v1 supported, AI and rate-limit configuration present
- Browser smoke: หน้าใหม่โหลดได้ และ v1 analysis จริงแสดงผลครบ 8/8 หัวข้อในประมาณ 11.17 วินาที
- Legacy API smoke: v0 response ใช้ exact legacy shape และไม่รั่ว field ของ v1

ระหว่าง production smoke พบว่า Gemini 3 ใช้ thinking และ output allowance มากกว่าค่าที่ตั้งเดิมจน response ถูกตัดและ schema validation ล้มเหลว จึงกำหนด `thinkingLevel: low` สำหรับงาน structured scoring และขยาย output cap ตามจำนวนหัวข้อ จากนั้น deploy Worker ใหม่และยืนยัน request เดิมผ่านจริง

## TestSprite production suite

การย้ายแบรนด์เป็น RubricLensAi ตรวจซ้ำบน `https://rubriclensai.pages.dev/` แล้ว:

- หน้าแรกและชื่อแบรนด์: run `7894d242-b164-46c7-9d43-33c7378b1a1f` ผ่าน
- ส่งรายงานและแสดงผล AI จริง: run `18404aaf-8f8e-4130-af26-d95d42b0ecae` ผ่าน 7/7 ขั้นตอน
- mobile viewport 390×844: run `cd178ead-3a16-4de5-bddb-81eee89e06dd` ผ่าน 9/9 ขั้นตอน
- fresh mobile agent run `10c4b318-7740-4ad7-b653-f71faad3c02a` ถูก block เพราะ runner ไม่มีคำสั่งเปลี่ยน viewport ไม่ใช่ application failure; ดาวน์โหลด artifact และยืนยันด้วย saved-code mobile run ข้างต้นแล้ว

TestSprite CLI `0.4.0` รันกับ production URL โดยตรง ผลสุดท้ายใน project `c76aad7a-c7f9-44a8-a888-a842a4cd386e` คือ **10/10 scenarios passed**

| Scenario | Latest production run | Result |
| --- | --- | --- |
| หน้าแรกและ empty state | `eb00b63a-4ab5-4acc-b336-7f832be2d8f3` | passed |
| แจ้งเตือนรายงานสั้น | `603a51b2-342d-4007-bc48-0679943e7646` | passed |
| ส่งข้อความและแสดงผล AI | `0268c5c8-f808-48d9-80c3-ae4a8efed3dd` | passed |
| ล้างร่าง | `336f3ca2-7352-4f3a-8294-d536f36a6871` | passed |
| เปลี่ยนประเภทงานและเกณฑ์ | `25ae4ab2-7400-467e-93cc-08380457e8eb` | 16/16 observations passed |
| Advanced rubric editor | `505ef4a6-9494-499b-aae7-10b572948d09` | passed |
| ปฏิเสธน้ำหนักติดลบ | `f1bdac8e-26eb-4b88-b431-8d96f04e0b8d` | passed |
| ยืนยันก่อนตัดภาคผนวก | `f5af0fa5-d8b0-485b-bec8-06277920768b` | passed |
| Privacy notice และ policy link | `b5e9155c-0e7b-46f4-a709-474f26acca6c` | 3/3 passed |
| Mobile layout | `923f34dd-2e90-4e49-9df0-c300b65a340f` | 17/17 passed |

[เปิด TestSprite project dashboard](https://www.testsprite.com/dashboard/tests/c76aad7a-c7f9-44a8-a888-a842a4cd386e)

### Failure triage ที่เกิดขึ้นระหว่างตรวจ

- เคสเดิม “เปลี่ยนรูปแบบรายงาน” ล้มเหลวเพราะ saved script ยังหา template หลายตัวใน dropdown เกณฑ์ ทั้งที่ UI ใหม่แยก selector “ประเภทงาน” แล้ว ตรวจ artifact ของ run `f79226d2-29ce-4950-bedc-09a47139f065` ยืนยันว่าเป็น test drift จึงสร้างเคสปัจจุบันจาก `.testsprite/plans/05-template-switch.json` ให้ผ่านก่อน แล้วลบเฉพาะเคสเก่าออกจาก dashboard
- mobile fresh run `e84b71c2-fe75-4bf6-a213-0c43b9eb7e2a` ถูก blocked เพราะ generated runner ไม่มีคำสั่ง resize viewport ไม่ใช่ application failure; ดาวน์โหลด artifact แล้ว จากนั้น replay saved code v4 เพียงครั้งเดียวและผ่าน 17/17 โดย resume polling run เดิมหลัง timeout แรก

Artifact ของ failure ถูกเก็บใต้ `.testsprite/runs/` และถูก ignore ไม่ให้ขึ้น Git

## สิ่งที่ผลทดสอบนี้ไม่ได้รับรอง

ผลข้างต้นยืนยัน UI, validation, request flow, API contract และ failure handling ด้วยข้อมูลสังเคราะห์ แต่ไม่ได้รับรองว่า:

- คะแนน AI ถูกต้องเชิงวิชาการสำหรับรายงานจริงทุกประเภท
- การตัดสิน N/A ตรงกับดุลพินิจของผู้ประเมิน (ยังไม่มี ground-truth dataset)
- consolidation เอกสารยาวเทียบเท่าการอ่านทั้งฉบับโดยผู้เชี่ยวชาญ
- ระบบตรวจ plagiarism หรือเป็นการรับรอง compliance ทางกฎหมาย/PDPA
