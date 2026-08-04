# Deployment runbook

Runbook สำหรับ deploy RubricLensAi ขึ้น production (Cloudflare Worker + Cloudflare Pages)

> **ต้องได้รับคำยืนยันจากเจ้าของโปรเจกต์ก่อนรันขั้นตอนที่ deploy จริงทุกครั้ง** ขั้นตอนที่ 0–1 รันได้อย่างปลอดภัยโดยไม่เปลี่ยนอะไรใน production

Worker และ Pages ถูก deploy แยกกัน รอบนี้ต้องใช้ลำดับ **compatibility Worker ก่อน แล้วจึง Pages เท่านั้น**

## Rolling deployment แบบไม่มีช่วง contract error

รอบนี้เปลี่ยนทั้ง request และ response contract จึงมี compatibility layer ที่ Worker:

| Client | การระบุเวอร์ชัน | Response ที่ Worker คืน |
| --- | --- | --- |
| Pages รุ่นเดิม | ไม่มี version header | v0 shape เดิมแบบ exact ไม่มีฟิลด์ใหม่ |
| Pages รุ่นใหม่ | `X-RubricLensAi-Api-Version: 1` | v1 ที่มี `apiVersion`, `documentType`, `scoreSummary` และ `applicability` |

idempotency cache แยก namespace ต่อ API version (`:v0`/`:v1`) จึงไม่มีทาง replay response คนละ shape ให้ client อีกเวอร์ชัน หลัง compatibility Worker ขึ้นแล้ว Pages รุ่นเดิมยังใช้งานได้ และเมื่อ Pages รุ่นใหม่ขึ้นก็เปลี่ยนไปใช้ v1 โดยไม่มีช่วง error

**ห้าม deploy Pages ก่อน Worker ในรอบนี้** เพราะ Worker รุ่นเดิมใช้ strict request schema และไม่รู้จัก `documentType` จาก Pages รุ่นใหม่ แม้ Pages รุ่นใหม่จะอ่าน response รุ่นเดิมได้ก็ตาม

อย่าถอด v0 compatibility ใน release เดียวกัน ให้พิจารณาถอดใน release ภายหลังเมื่อยืนยันแล้วว่าไม่มี Pages bundle รุ่นเดิมถูกใช้งานอยู่

## Order of operations

```text
0. Local quality gate
1. Worker dry-run
2. Worker deploy
3. Health + contract smoke
4. Pages deploy
5. Browser smoke
6. TestSprite suite
```

### 0. Local quality gate

```bash
npm ci
npm run verify
```

`npm run verify` รัน lint, unit tests, `worker:check`, production dependency audit และ production-preview E2E ด้วยชุดคำสั่งเดียวกับที่ CI ใช้ ต้องผ่านทั้งหมดก่อนไปขั้นต่อไป

### 1. Worker dry-run

```bash
npm run worker:check
```

ตรวจว่า bundle build ได้ และ binding (`RATE_LIMIT` KV, vars) ตรงกับที่คาดไว้ ยังไม่มีอะไรถูก deploy ในขั้นนี้

ตรวจก่อนไปต่อ:

- `GEMINI_API_KEY` ถูกตั้งเป็น Worker Secret แล้ว (`npx wrangler secret list`)
- `ALLOWED_ORIGIN` ตรงกับ Pages domain ที่ใช้จริง
- KV namespace id ใน `wrangler.jsonc` ตรงกับ namespace ที่ตั้งใจใช้

### 2. Worker deploy

```bash
npx wrangler deploy
```

บันทึก **version id** ที่ wrangler แสดงหลัง deploy สำเร็จ และบันทึก version id ของรุ่นก่อนหน้าไว้ด้วย (`npx wrangler deployments list`) เพื่อใช้ rollback

### 3. Health and contract smoke

```bash
curl -s https://rubriclensai-api.oomzazato01.workers.dev/api/health
```

ต้องได้:

- HTTP 200 และ `"status":"ok"`
- `"apiVersion":1` ตรงกับ `API_VERSION` ใน `shared/api-contract.ts`
- `"supportedApiVersions":[0,1]` และ `"legacyDefaultVersion":0`
- `"aiConfigured":true` และ `"rateLimitConfigured":true`

ถ้า `apiVersion` หรือ `supportedApiVersions` ไม่ตรง **ให้หยุดและ rollback Worker** อย่าเพิ่ง deploy Pages

ตรวจ CORS และ method guard เพิ่ม:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://rubriclensai-api.oomzazato01.workers.dev/api/analyze   # ต้องได้ 405
```

ก่อน deploy Pages ให้เปิด Pages รุ่นเดิมและวิเคราะห์ข้อความสังเคราะห์หนึ่งครั้ง เพื่อตรวจว่า compatibility Worker คืน v0 shape ที่ UI เดิมอ่านได้ ห้ามใช้เอกสารจริงหรือข้อมูลส่วนบุคคลในการ smoke test

### 4. Pages deploy

```bash
npm run build
npx wrangler pages deploy dist --project-name rubriclensai --branch main
```

บันทึก deployment id ที่ได้ และ deployment id ของรุ่นก่อนหน้า

### 5. Browser smoke

เปิด https://rubriclensai.pages.dev/ แล้วตรวจด้วยมือ:

1. หน้าโหลดได้ และหัวข้อ “RubricLensAi” แสดงผล
2. เปลี่ยนประเภทงานเป็นโครงงานและรายงานวิจัย แล้วเกณฑ์เปลี่ยนตาม
3. วางข้อความสังเคราะห์แล้วกดตรวจ จนได้ผลจริงจาก Worker
4. ผลแสดงคะแนนรวม หลักฐาน และ “สิ่งที่ควรแก้ก่อนส่ง”
5. ไม่มี error ใน browser console โดยเฉพาะข้อความเรื่องเวอร์ชันไม่ตรงกัน
6. ท้ายเว็บแสดง “© 2026 RubricLensAi” และลิงก์ทั้งสามกดได้
7. `https://rubriclensai.pages.dev/privacy` และ `/terms` เปิดได้ตรง ๆ (ไม่ใช่ตกไปหน้าแรก) และหัวเรื่องตรงกับหน้า
8. เปิดเส้นทางที่ไม่มีอยู่จริง เช่น `/cookies` แล้วต้องเจอหน้า 404 ของเราเอง ไม่ใช่หน้าเปล่าของ Cloudflare
9. กดลิงก์อีเมลในหน้านโยบายแล้ว**ส่งเมลทดสอบจริงหนึ่งฉบับ** ยืนยันว่าเข้ากล่องจดหมาย (ดูหัวข้อ “ก่อน deploy หน้ากฎหมายครั้งแรก”)

ห้ามใช้เอกสารจริงหรือข้อมูลส่วนบุคคลในการ smoke test

### 6. TestSprite suite

รันหลัง Pages deploy เสร็จเท่านั้น เพราะ TestSprite CLI ทดสอบ deployed URL:

```bash
testsprite --version
testsprite auth whoami
testsprite test run <test-id> --target-url https://rubriclensai.pages.dev --wait --timeout 600 --output json
```

เมื่อมี failure ให้ดาวน์โหลด artifact มาตรวจก่อนแก้:

```bash
testsprite test artifact get <run-id> --out ./.testsprite/runs/<run-id>/
```

จากนั้นอัปเดต `docs/testing-report.md` ด้วย run id, dashboard URL และเวลาที่รันจริง

## Rollback

### Worker rollback

```bash
npx wrangler deployments list
npx wrangler rollback --message "rollback: <เหตุผลสั้น ๆ>"
```

`wrangler rollback` ย้อนไป deployment ก่อนหน้า หากต้องระบุเวอร์ชันเจาะจงให้ใช้ `npx wrangler rollback <version-id>`

หลัง rollback:

1. ถ้า Pages รุ่นใหม่ยังไม่ถูก deploy ให้ rollback Worker ได้ทันที แล้วเรียก `/api/health` ซ้ำ
2. ถ้า Pages รุ่นใหม่ถูก deploy ไปแล้ว **ต้อง rollback Pages ก่อน แล้วจึง rollback Worker** เพราะ Worker รุ่นเดิมปฏิเสธ request shape ของ Pages รุ่นใหม่

หมายเหตุ: rollback ไม่ล้างค่าใน KV ผลที่ cache ไว้ตาม idempotency จะหมดอายุเองภายใน 10 นาที

### Pages rollback

```bash
npx wrangler pages deployment list --project-name rubriclensai
```

จากนั้นใน Cloudflare Dashboard → Workers & Pages → rubriclensai → Deployments เลือก deployment ที่ต้องการแล้วกด **Rollback**

Pages เก็บ deployment เก่าไว้ จึง rollback ได้ทันทีโดยไม่ต้อง build ใหม่ หากต้องการ rollback ผ่าน CLI ให้ deploy artifact ของ commit เดิมซ้ำ:

```bash
git checkout <commit-เดิม>
npm ci && npm run build
npx wrangler pages deploy dist --project-name rubriclensai --branch main
```

### ลำดับการ rollback

ย้อนลำดับกับตอน deploy: **Pages ก่อน แล้วค่อย Worker** เพื่อไม่ให้มีช่วงที่ browser bundle ใหม่คุยกับ Worker เก่า

## ก่อน deploy หน้ากฎหมายครั้งแรก — ตรวจอีเมลติดต่อ

หน้า `/privacy` และ `/terms` ประกาศอีเมลจาก `CONTACT_EMAIL` ใน `src/lib/site-info.ts`
กฎเหล็กคือ **ค่าที่ deploy ต้องเป็นอีเมลที่รับเมลได้จริง** เพราะช่องทางติดต่อตาม PDPA ที่ส่งไม่ถึง
แย่กว่าการไม่ประกาศ ผู้ใช้จะส่งแล้วเด้งกลับโดยเราไม่รู้

สถานะปัจจุบัน: ใช้อีเมลส่วนตัวที่ใช้งานได้จริง เพราะโดเมน `rubriclensai.com` ยังไม่ต่อ DNS

เมื่อจะย้ายไปอีเมลโดเมน ทำตามลำดับนี้:

1. ต่อโดเมนเข้า Cloudflare แล้วเปิด **Email Routing** ให้ forward `privacy@rubriclensai.com`
   เข้ากล่องจดหมายจริง
2. ส่งเมลทดสอบหาที่อยู่นั้นหนึ่งฉบับ และยืนยันว่าได้รับ **ก่อน** แก้โค้ด
3. แก้ `CONTACT_EMAIL` ที่ `src/lib/site-info.ts` บรรทัดเดียว แล้วแก้ที่อยู่ใน `SECURITY.md` ให้ตรงกัน
4. รัน `npm run verify` แล้ว deploy ใหม่

ทั้งสองหน้ามีช่องทางสำรองเป็น GitHub Issues กำกับไว้แล้ว แต่ช่องทางสำรองไม่ทดแทนอีเมลที่ประกาศไว้

## Secrets, domain and billing

การเปลี่ยนค่าเหล่านี้อยู่นอก runbook นี้ และต้องได้รับคำยืนยันจากเจ้าของโปรเจกต์เป็นรายครั้ง:

- `GEMINI_API_KEY` และ secret อื่น ๆ
- Cloudflare account, Pages project หรือ custom domain
- KV namespace id
- Google Cloud billing หรือ quota
