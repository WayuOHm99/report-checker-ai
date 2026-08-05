# Testing report

รายงานนี้แยกผลตรวจ local/CI ออกจาก production เพื่อให้ตรวจสอบย้อนกลับได้ว่าทดสอบ source และ deployment ใด

## Local verification

**สถานะ: ผ่าน automated quality gates ทั้งหมด**

### รอบล่าสุด — 5 สิงหาคม 2026 (หลังกันภาษาปน และ health check ที่ตรวจ key จริง)

รันบน Node.js 24 หลังเพิ่มด่านตรวจอักษร CJK ในผลของโมเดล และเพิ่มโหมด `/api/health?verify=ai`

| Layer | Command | Result |
| --- | --- | --- |
| Static analysis | `npm run lint` | passed |
| Unit/component | `npm run test` | 141/141 passed (เพิ่ม 8 เคส: ภาษาปน 3, health verify 5) |
| Worker bundle and bindings | `npm run worker:check` | passed — binding เท่าเดิม ไม่มี binding ใหม่ |
| Production dependency audit | `npm run audit:prod` | passed (ไม่มี high/critical) — moderate ค้าง 1 รายการเดิม (`hono`) |
| Production-preview E2E | `npm run test:e2e` | 88/88 passed (ไม่ได้เพิ่มเคสใหม่ — งานรอบนี้ไม่แตะ UI) |

**พิสูจน์ว่าเทสต์ใหม่จับของจริง:** ปิดการทำงานของ `containsForeignScript()` ชั่วคราวแล้วรันซ้ำ
เคส “asks the model again when it mixes Japanese characters into the Thai review” และ
“still shows the review when the model keeps mixing Japanese characters after the retry”
**แดงทั้งคู่** (`expected to be called 2 times, but got 1 times`) จากนั้นคืนโค้ดกลับแล้วเขียวทั้งคู่
ทำแบบนี้เพราะเทสต์ที่เขียนหลังโค้ดอาจผ่านโดยไม่ได้ตรวจอะไรเลย

**สิ่งที่เทสต์ชุดนี้ยังไม่ครอบ:** ไม่ได้ทดสอบว่า prompt ที่แก้ถ้อยคำใหม่ทำให้ Gemini
ปนภาษาน้อยลงจริงหรือไม่ — วัดได้ก็ต่อเมื่อเก็บสถิติจากการใช้งานจริงเป็นชุด
ด่านในโค้ดจึงเป็นชั้นที่พึ่งได้จริง ส่วน prompt เป็นชั้นเสริม

### รอบก่อนหน้า — 4 สิงหาคม 2026 (หลังเพิ่มหน้ากฎหมายและท้ายเว็บ)

รันบน Node.js 24 หลังเพิ่มหน้า `/privacy` (รวมหัวข้อคุกกี้), หน้า `/terms`,
ท้ายเว็บแบบโปรดักต์ และเปลี่ยน build เป็น multi-page (สามหน้า)

| Layer | Command | Result |
| --- | --- | --- |
| Static analysis | `npm run lint` | passed |
| Unit/component | `npm run test` | 133/133 passed (เพิ่ม 18 เคสของหน้ากฎหมายและท้ายเว็บ) |
| Worker bundle and bindings | `npm run worker:check` | passed |
| Production dependency audit | `npm run audit:prod` | passed (ไม่มี high/critical) — moderate ค้าง 1 รายการเดิม |
| Production build | `npm run build` | passed — ได้ `index.html`, `privacy.html`, `terms.html` และคัดลอก `public/404.html` |
| Production-preview E2E | `npm run test:e2e` | 88/88 passed (เพิ่ม `e2e/legal-pages.spec.ts` 4 เคส × 4 browser project) |
| Documentation screenshots | `npm run screenshots` | 5/5 captured — เก็บใหม่หลัง UI เปลี่ยน |

`e2e/legal-pages.spec.ts` ตรวจสิ่งที่เทสต์ระดับ component ตรวจแทนไม่ได้ คือ URL `/privacy` และ `/terms`
เปิดได้จริงบนบันเดิลที่จะ deploy, การคลิกจากท้ายเว็บพาไปถูกหน้า, ปุ่มกลับหน้าแรกใช้ได้
และหน้ากฎหมายไม่เขียนอะไรลงที่เก็บข้อมูลของเบราว์เซอร์เลย

ระหว่างทาง `App.test.tsx` เคสเดิม “uses one primary action without an age gate or privacy card”
จับได้ว่าป้ายลิงก์ footer คำว่า “ความเป็นส่วนตัว” ไปชนด่านที่กันการ์ดขอความยินยอมแบบเก่า
แก้ที่โค้ดโดยเปลี่ยนป้ายเป็นชื่อเต็ม ไม่ได้แก้เคสเดิม

ตรวจเพิ่มด้วยมือว่า `/privacy` และ `/terms` เปิดได้ทั้งบน dev server และ `vite preview`
(ตอบ 200 พร้อม `<title>` ของหน้านั้นจริง ไม่ใช่ fallback ไปหน้าแรก) ยังไม่ได้ตรวจบน production
เพราะยังไม่ได้ deploy

### รอบก่อนหน้า — 4 สิงหาคม 2026 (หลังจัดโครงสร้าง repo สำหรับ portfolio)

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

**สถานะ: deploy หน้ากฎหมายและตรวจ production ผ่านแล้วเมื่อ 4 สิงหาคม 2026**

### รอบล่าสุด — 4 สิงหาคม 2026 (Pages เท่านั้น ไม่ได้แตะ Worker)

- Pages deployment: `b376c803` (`https://b376c803.rubriclensai.pages.dev`) branch `main`
- Worker: **ไม่ได้ deploy ใหม่** เพราะงานรอบนี้ไม่แตะ `worker/` เลย
- Worker health ตรวจแล้วยังปกติ: `apiVersion 1`, `supportedApiVersions [0,1]`, `aiConfigured true`,
  `rateLimitConfigured true`, model `gemini-3.6-flash` / fallback `gemini-3.5-flash-lite`

ตรวจบนเบราว์เซอร์จริงกับ `https://rubriclensai.pages.dev` ผ่านทั้ง 6 ข้อ:

| ตรวจอะไร | ผล |
| --- | --- |
| หน้าแรกโหลดได้ และท้ายเว็บแสดง “© 2026 RubricLensAi” | ผ่าน |
| ลิงก์ท้ายเว็บชี้ไป `/privacy` และ `/terms` ถูกต้อง | ผ่าน |
| `/privacy` แสดงหัวข้อคุกกี้ ชื่อคีย์ที่เก็บจริงทั้งสองตัว อีเมลติดต่อ และอายุ 10 นาที | ผ่าน |
| `/terms` แสดงหัวข้อ “ให้บริการตามสภาพ” และ “ข้อจำกัดความรับผิด” | ผ่าน |
| `/cookies` (เส้นทางที่ไม่มีแล้ว) คืน **404 จริง** พร้อมหน้า 404 ของเราเอง | ผ่าน |
| ไม่มี console error บนหน้านโยบาย | ผ่าน |

`sitemap.xml` บน production คืนครบ 3 URL แล้ว

**สิ่งที่รอบนี้ยังไม่ได้ตรวจ:** ไม่ได้สั่งวิเคราะห์จริงด้วย Gemini บน production
เพราะงานรอบนี้ไม่แตะ Worker และไม่อยากใช้โควตารายวันโดยไม่จำเป็น
เส้นทางส่งตรวจถูกครอบด้วย E2E บนบันเดิลชุดเดียวกับที่ deploy แล้ว (แบบ stub API)

หลัง deploy เสร็จใหม่ ๆ edge cache ของ Cloudflare ยังคืนของเดิมอยู่ประมาณหนึ่งนาที
(`/privacy` ตอบเป็นหน้าแรก และ `sitemap.xml` ยังมี URL เดียว) หลังจากนั้นตรงทั้งหมด

### รอบก่อนหน้า — 2 สิงหาคม 2026

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

แผนที่ 11 (`.testsprite/plans/11-legal-pages.json`) ครอบหน้านโยบาย ข้อกำหนด และหน้า 404
**ยังไม่ได้รัน** เพราะ TestSprite ทดสอบ URL ที่ deploy แล้วเท่านั้น และรอบนี้ยังไม่ได้ deploy

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
