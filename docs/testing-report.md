# Testing report

รายงานนี้แยกผลตรวจ local/CI ออกจาก production เพื่อให้ตรวจสอบย้อนกลับได้ว่าทดสอบ source และ deployment ใด

## Local verification

**สถานะ: ผ่าน automated quality gates ทั้งหมด**

ตรวจล่าสุด 2 สิงหาคม 2026 ด้วย Node.js 24 บน working tree ที่มี production hardening รอบนี้

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

- Live URL: [https://rubriclens.pages.dev/](https://rubriclens.pages.dev/)
- Pages deployment: `3be093f5-c6b5-4075-ac2c-851ee85aa307`
- Pages source commit: `e1c0112`
- Worker version: `789fe495-e544-48b3-b228-a7bb623c52eb`
- Worker health: API v0/v1 supported, AI and rate-limit configuration present
- Browser smoke: หน้าใหม่โหลดได้ และ v1 analysis จริงแสดงผลครบ 8/8 หัวข้อในประมาณ 11.17 วินาที
- Legacy API smoke: v0 response ใช้ exact legacy shape และไม่รั่ว field ของ v1

ระหว่าง production smoke พบว่า Gemini 3 ใช้ thinking และ output allowance มากกว่าค่าที่ตั้งเดิมจน response ถูกตัดและ schema validation ล้มเหลว จึงกำหนด `thinkingLevel: low` สำหรับงาน structured scoring และขยาย output cap ตามจำนวนหัวข้อ จากนั้น deploy Worker ใหม่และยืนยัน request เดิมผ่านจริง

## TestSprite production suite

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
