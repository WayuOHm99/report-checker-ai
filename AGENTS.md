# กติกาการทำงานกับโปรเจกต์นี้

## บริบทของคนที่คุณกำลังทำงานด้วย

**เจ้าของโปรเจกต์นี้ไม่มีพื้นฐานการเขียนโค้ด** ให้ถือว่านี่เป็นข้อจำกัดหลักในการทำงานทุกอย่าง แปลว่า:

- เขาตรวจสอบงานคุณจากโค้ดโดยตรงไม่ได้ → **คุณต้องสร้างหลักฐานที่ตรวจสอบได้แทน** (ผล test, คำอธิบายภาษาคน)
- เขาไม่รู้ว่าอะไรคือ best practice → **คุณต้องเป็นคนเสนอ ไม่ใช่รอให้เขาสั่ง**
- ถ้าคุณทำพังแบบเงียบๆ เขาจะไม่รู้จนกว่าจะสายเกินแก้ → **ห้ามทำอะไรเงียบๆ**
- ศัพท์เทคนิคทุกคำต้องมีคำอธิบายภาษาคนกำกับครั้งแรกที่ใช้

**ตอบเป็นภาษาไทยเสมอ**

---

## กฎเหล็ก 7 ข้อ — ห้ามละเมิด

### 1. ห้ามแก้ test เพื่อให้ผ่าน

Test คือเครื่องมือชิ้นเดียวที่เจ้าของโปรเจกต์ใช้ตรวจงานคุณได้ การแก้ test ให้เข้ากับโค้ดที่พัง = การทำลายเครื่องมือนั้น

- ถ้า test แดง ให้แก้ **โค้ด** ไม่ใช่แก้ test
- ถ้าคิดว่า test เขียนผิดจริงๆ → **หยุด แจ้งเหตุผล รอการอนุมัติ** ห้ามแก้เอง
- ห้ามลบ test, ห้าม skip test, ห้าม comment test ทิ้ง — ไม่ว่ากรณีใด
- ห้ามใส่ค่าตายตัว (hardcode) เพื่อให้ test ผ่าน
- ถ้าแก้ไฟล์ test ด้วยเหตุผลใดก็ตาม **ต้องรายงานทุกครั้ง** พร้อมบอกว่าแก้อะไร ทำไม

### 2. ห้ามอ้างว่าเสร็จโดยไม่มีหลักฐาน

คำว่า "เสร็จแล้ว" ต้องมาคู่กับ **ผลการรัน test แบบดิบ** เสมอ

- ถ้ารัน test ไม่ได้ ให้บอกตรงๆ ว่ารันไม่ได้เพราะอะไร ห้ามเดาว่ามันน่าจะผ่าน
- ห้ามเขียนว่า "น่าจะทำงานได้" แล้วจบ

### 3. หนึ่งงาน = หนึ่งการเปลี่ยนแปลง

- ทำเฉพาะสิ่งที่ถูกสั่ง ห้ามแถม
- เห็นอย่างอื่นที่ควรแก้ → **เขียนไว้ในรายงาน อย่าแก้เอง**
- ห้ามจัดรูปแบบไฟล์ใหม่ทั้งไฟล์ (reformat) ปนไปกับการแก้ฟีเจอร์ — จะทำให้ตรวจไม่ออกว่าอะไรเปลี่ยนจริง
- ห้ามอัปเกรด/เพิ่ม/ลบ library โดยไม่ได้ขอ

### 4. งานใหญ่ต้องคุยก่อนเขียน

ถ้างานเข้าข่ายข้อใดข้อหนึ่ง — **ห้ามเขียนโค้ดทันที**

- เพิ่มฟีเจอร์ใหม่
- แก้ไฟล์เกิน 3 ไฟล์
- เปลี่ยนวิธีเก็บข้อมูล / โครงสร้างข้อมูล
- เพิ่ม library ใหม่
- แก้อะไรที่ยังไม่มี test ครอบ

ให้ทำแทน: ถามคำถามทีละข้อจนเข้าใจครบ → สรุปเป็น spec → รออนุมัติ

### 5. ห้ามเดาแล้วทำต่อ

- ไม่รู้ → ถาม
- อ่านโค้ดแล้วไม่แน่ใจว่ามันทำอะไร → บอกว่าไม่แน่ใจ ห้ามเดา
- ถ้าจำเป็นต้องสมมติอะไร ให้เขียนไว้ชัดๆ ว่า **"ผมสมมติว่า ___ ถ้าผิดบอกได้"**

### 6. ห้ามแตะสิ่งเหล่านี้โดยไม่ได้รับอนุญาต

- ไฟล์ `.env`, secret, API key, รหัสผ่าน (และห้ามเขียนค่าพวกนี้ลงในโค้ดเด็ดขาด)
- ข้อมูล/ฐานข้อมูลจริง — ห้ามลบ ห้ามเขียนทับ
- ไฟล์ตั้งค่า git, CI, deployment
- คำสั่งที่ลบของแบบกู้ไม่ได้ (`rm -rf`, `DROP TABLE`, `git push --force`, `git reset --hard`)

ถ้าคิดว่าจำเป็นต้องทำ → หยุด อธิบาย รออนุมัติ

### 7. ทุกงานจบด้วยรายงาน

รูปแบบตายตัว (ดูข้างล่าง) ห้ามข้าม

---

## รูปแบบรายงานหลังจบงาน

```markdown
## เปลี่ยนอะไรไปบ้าง
- [ไฟล์ไหน] — [ทำอะไร อธิบายเป็นภาษาคน 1 บรรทัด]

## ผล test
[แปะผลดิบจากการรัน test ทั้งหมด ไม่ใช่สรุป]
ผ่าน X / ไม่ผ่าน Y

## แตะไฟล์ test ไหม
[ไม่แตะ] หรือ [แตะ — แก้อะไร เพราะอะไร]

## สิ่งที่ผมสมมติเอาเอง
- [ถ้าไม่มี เขียนว่า "ไม่มี"]

## สิ่งที่อาจพังตามแต่ผมยังไม่ได้เช็ค
- [ถ้าไม่มี เขียนว่า "ไม่มี"]

## เห็นอะไรที่ควรแก้แต่ยังไม่ได้แก้
- [ไว้เป็นรายการรอ ไม่ต้องทำตอนนี้]

## ต้องอัปเดต docs/architecture.md ไหม
[ต้อง / ไม่ต้อง — ถ้าต้อง อัปเดตแล้วบอกว่าแก้ส่วนไหน]
```

---

## มาตรฐานการเขียนโค้ด

### เขียนให้แก้ง่าย ไม่ใช่เขียนให้ฉลาด

เกณฑ์ตัดสินโค้ดดี-ไม่ดีในโปรเจกต์นี้มีข้อเดียว: **อีก 3 เดือนกลับมาอ่านแล้วเข้าใจไหม**

- ตั้งชื่อให้ตรงกับสิ่งที่มันทำ ชื่อยาวได้ อย่าย่อจนงง
- โค้ดที่ตรงไปตรงมาแต่ยาวหน่อย > โค้ดสั้นที่ต้องคิดตาม
- ห้ามใช้เทคนิคหวือหวาที่คนไม่มีพื้นฐานอ่านไม่ออก
- ห้ามสร้างชั้น abstraction ที่ยังไม่จำเป็น ("เผื่ออนาคต" = ไม่ต้อง)

### ซ่อนความซับซ้อนไว้หลังปุ่มง่ายๆ (Deep Module)

- แต่ละไฟล์/ก้อนโค้ดควรมีหน้าที่ที่อธิบายได้ใน 1 ประโยค
- เปิดออกมาให้ข้างนอกเรียกใช้แค่เท่าที่จำเป็น ที่เหลือซ่อนไว้ข้างใน
- ชอบก้อนใหญ่ที่หน้าที่ชัดเจน มากกว่าก้อนเล็กๆ เยอะแยะที่เรียกกันไปมา

### แยกส่วนที่เปลี่ยนบ่อยออกจาก logic (Ports & Adapters)

- logic หลักของโปรแกรม **ห้ามผูกตรง** กับวิธีเก็บข้อมูล, ระบบภายนอก, หรือหน้าจอ
- ให้ผ่าน "ข้อต่อ" (interface) เสมอ เพื่อให้สลับชิ้นส่วนได้โดยไม่ต้องแก้ logic
- เวลาเขียนของใหม่ที่ต้องต่อกับระบบภายนอก ให้เสนอโครงแบบนี้ก่อนเสมอ

### เรื่องความปลอดภัยขั้นต่ำ

- ค่าที่เป็นความลับอยู่ใน `.env` เท่านั้น และ `.env` ต้องอยู่ใน `.gitignore`
- ข้อมูลที่รับจากผู้ใช้ ต้องตรวจก่อนใช้เสมอ
- ข้อความ error ที่แสดงให้ผู้ใช้เห็น ห้ามมีรายละเอียดภายในระบบ

---

## เกี่ยวกับ Test

- **ทุกการแก้บั๊กต้องมี test** ที่จำลองบั๊กนั้น เขียน test ก่อน (ให้มันแดง) แล้วค่อยแก้
- ทุกฟีเจอร์ใหม่ต้องมี test อย่างน้อยครอบ: กรณีปกติ / กรณีผู้ใช้กรอกผิด / กรณีขอบเขต (ค่าว่าง, ศูนย์, ค่าเยอะผิดปกติ)
- ตั้งชื่อ test เป็นประโยคที่คนไม่มีพื้นฐานอ่านรู้เรื่อง
- test ต้องรันซ้ำกี่รอบก็ได้ผลเดิม — ห้ามพึ่งเวลาจริง, อินเทอร์เน็ต, หรือข้อมูลจริง
- test ต้องไม่ทิ้งไฟล์ขยะหรือแก้ข้อมูลจริง

---

## ไฟล์ที่ต้องดูแลให้ตรงความจริงเสมอ

| ไฟล์ | คืออะไร | อัปเดตเมื่อ |
|------|---------|-------------|
| `docs/architecture.md` | ผังบ้านของโปรเจกต์ — อะไรอยู่ตรงไหน, คะแนนคำนวณที่ไหน | โครงสร้างเปลี่ยน / เพิ่มไฟล์สำคัญ |
| `README.md` | วิธีติดตั้งและรันโปรเจกต์ | วิธีรันเปลี่ยน / เพิ่ม dependency |
| `docs/deployment-runbook.md` | ขั้นตอน deploy และค่าที่ต้องตั้ง | วิธี deploy หรือ env var เปลี่ยน |
| `docs/testing-report.md` | สถานะการทดสอบล่าสุด | หลังรันชุดทดสอบใหญ่ |
| `LESSONS.md` | บทเรียนจากสิ่งที่เคยพัง | หลังแก้ปัญหาใหญ่ทุกครั้ง |

**เริ่มงานทุกครั้ง: อ่าน `docs/architecture.md` ก่อนเสมอ** โดยเฉพาะหัวข้อ "จุดเปราะ" และถ้างานเกี่ยวกับ config, การเรียกโมเดล หรือการกันงบ ให้อ่าน `LESSONS.md` ด้วย

**เอกสารที่ไม่ตรงกับโค้ด อันตรายกว่าไม่มีเอกสาร** — ถ้าเจอว่าเอกสารหรือ comment ไม่ตรงกับความจริง ให้แจ้งทันที

---

## สิ่งที่ควรทำโดยไม่ต้องรอให้สั่ง

- เห็นความเสี่ยงหรือปัญหาที่จะเกิดในอนาคต → บอก (แต่ยังไม่ต้องแก้)
- เจ้าของโปรเจกต์สั่งอะไรที่จะทำให้เจ็บตัวทีหลัง → **ทักท้วง** พร้อมเสนอทางเลือกที่ดีกว่า อย่าเออออตาม
- คำสั่งกำกวม → ถามให้ชัด ดีกว่าทำผิดแล้วต้องรื้อ
- งานที่กำลังจะทำเสี่ยง → เตือนก่อนว่า "ก่อนทำ ควร commit ไว้ก่อนนะครับ"

---

## คำที่ห้ามพูด

| ❌ ห้ามพูด | ✅ พูดแบบนี้แทน |
|-----------|----------------|
| "เสร็จเรียบร้อยแล้วครับ" (ลอยๆ) | "เสร็จแล้ว — test ผ่าน 12/12 ผลตามนี้: [แปะผล]" |
| "น่าจะทำงานได้" | "ผมยังไม่ได้ทดสอบส่วนนี้ ต้องเช็คด้วยการ ___" |
| "แก้ให้แล้วครับ" | "แก้ที่ไฟล์ ___ บรรทัด ___ โดยเปลี่ยนจาก ___ เป็น ___ เพราะ ___" |
| "เป็นเรื่องปกติครับ" | อธิบายว่าทำไมถึงเป็นแบบนั้น |

---

## หมายเหตุเฉพาะโปรเจกต์นี้

- **โปรเจกต์นี้คือ:** RubricLensAi — เว็บที่ให้ผู้ใช้อัปโหลดเอกสาร (PDF/ข้อความ) แล้วให้ AI ตรวจตามเกณฑ์ (rubric) ที่ผู้ใช้กำหนดเอง แล้วคืนคะแนนถ่วงน้ำหนักพร้อมข้อเสนอแนะ
- **ภาษา / เครื่องมือหลัก:** React 19 + TypeScript + Vite (หน้าเว็บ) / Cloudflare Worker (หลังบ้าน `worker/`) / Google Gemini (ตัวตรวจ) / Tailwind + shadcn (หน้าตา) / Vitest + Playwright (test)
- **ไม่มีฐานข้อมูล โดยตั้งใจ** — ระบบเป็น stateless (ไม่จำอะไรระหว่างครั้ง) ใช้ KV เก็บแค่ตัวนับ rate limit กับ idempotency ชั่วคราวเท่านั้น **ห้ามเสนอให้เพิ่ม database**
- **คำสั่งรันโปรแกรม:** `npm run dev` (หน้าเว็บ) และ `npm run worker:dev` (หลังบ้าน — ต้องรันคู่กันถ้าจะทดสอบการเรียก AI จริง)
- **คำสั่งรัน test:** `npm test` (เร็ว ใช้ระหว่างทำงาน) / `npm run verify` (ครบชุด: lint + test + worker check + audit + e2e — ต้องผ่านก่อน deploy ทุกครั้ง)
- **ส่วนที่เปราะมาก ห้ามแตะโดยไม่ถาม:**
  - `shared/scoring.ts` — สูตรคะแนนชุดเดียวที่ใช้ทั้ง Worker และ browser แก้ผิด = คะแนนเพี้ยนทั้งระบบโดยไม่มีอะไรเตือน
  - `shared/api-contract.ts` — `API_VERSION` ผูกกันสองฝั่ง แก้ข้างเดียวแล้ว browser จะไม่ยอมรับผลจาก Worker
  - `wrangler.jsonc` — โดยเฉพาะ `ALLOWED_ORIGIN` และรายชื่อ model
  - `worker/src/index.ts` — จุดที่ตรวจ input, กันค่าใช้จ่ายบานปลาย และเรียก Gemini
- **สิ่งที่เคยพังแล้วห้ามให้เกิดซ้ำ:**
  - **แก้ค่า env ผ่านหน้าเว็บ Cloudflare dashboard** → `ALLOWED_ORIGIN` ถูกเขียนทับจนเว็บจริงเรียก API ไม่ได้ ขึ้น `Failed to fetch` แบบไม่บอกสาเหตุ **ให้ `wrangler.jsonc` เป็นแหล่งความจริงเดียวเสมอ** (commit `fc59089`)
  - **Gemini ตอบช้าจนค้าง** → ต้องมีการจำกัดเวลารอทุกครั้งที่เรียก model (commit `1cfc762`)

---

<!-- BEGIN TESTSPRITE AGENT SECTION (testsprite agent install codex) -->
<!-- testsprite-skill: testsprite-verify+testsprite-onboard v0.4.0 sha256:704662e5a77c -->
# TestSprite Verification Loop

After finishing a feature or fix in a TestSprite-tested repo, use the `testsprite`
CLI to run the relevant TestSprite tests against the change and inspect any failure
artifacts before reporting the work as done. Use whenever code has changed outside
docs/config and is about to be reported complete.

## When to run

Run after a feature or fix lands. Skip only for: docs-only edits, pure
build/config changes, or when the repo has no TestSprite project linked.

The CLI only tests a reachable deployed URL (it rejects localhost). If the
change is only running locally, hand off to the TestSprite MCP when it's
available — it tunnels your local server; otherwise report the change as
unverified-because-undeployed and stop. If the user explicitly named a tool
(the CLI or the MCP), honor that over this reachability heuristic.

## Core loop

### 1. Preflight

```bash
testsprite --version          # CLI installed?
testsprite auth whoami        # credentials valid?
```

If `--version` fails, tell the user to install the CLI and stop.
If `auth whoami` fails, tell the user to run `testsprite auth configure` and stop.

### 2. Find the project

In order: `$TESTSPRITE_PROJECT_ID` → `.testsprite/config.json` → `testsprite project list --output json`.

### 3. Run

```bash
# New frontend test from plan (most common)
testsprite test create --plan-from plan.json --run --wait \
  --target-url https://staging.example.com --timeout 600 --output json

# Existing test
testsprite test run <test-id> --target-url https://staging.example.com \
  --wait --timeout 600 --output json

# New backend test from Python assertion file
testsprite test create --type backend --name "Login rejects empty password" \
  --project <id> --code-file /tmp/test.py --run --wait --timeout 600

# Replay (cheaper than a fresh run — reuses saved test code)
testsprite test rerun <test-id> --wait --output json

# Backend tests sharing state: declare the dependency graph at create time;
# the wave engine orders runs (producers → consumers → teardown last)
testsprite test create --type backend --project <id> --code-file /tmp/login.py \
  --name "login issues an auth token" --produces auth_token
testsprite test create --type backend --project <id> --code-file /tmp/profile.py \
  --name "profile update accepts the token" --needs auth_token
testsprite test create --type backend --project <id> --code-file /tmp/cleanup.py \
  --name "fixture user is deleted" --category teardown

# Wave-ordered batch fresh run (BE tests, all or filtered)
testsprite test run --all --project <id> [--filter <substr>] \
  --wait --max-concurrency 4 --output json
```

**Key behaviors:**

- `--target-url` must be publicly reachable (no localhost / RFC1918) and must
  already have the change deployed (e.g. a CI preview deploy) — the CLI tests a
  deployed URL, it doesn't host your environment. Running earlier verifies the
  previous build.
- Backend `--code-file`: the runner executes the file top-to-bottom (not `pytest`), so **call your `test_*` function(s) at the end of the file** — a defined-but-uncalled test silently passes.
- Backend sandbox has only stdlib + `requests` + `pytest` + `numpy` + `scipy`. Test the API over HTTP with `requests`; do **not** `import` the project's own source modules or other packages (e.g. `torch`) — they aren't installed and the test won't run.
- `--wait` long-polls until terminal. Do not wrap it in a retry loop.
- Exit `0` = passed; `1` = failed/blocked; `7` = timeout (resume with `test wait <run-id>`).
- BE dependency flags (`--produces`/`--needs`/`--category`) are backend-only and
  **create-only** — they can't be read back or edited later (delete + recreate to
  change the graph). Don't hand-sequence `test run` calls to fake ordering; use
  `test run --all` so the engine passes captured variables between waves.
- A BE `test rerun` dispatches the whole producer/teardown closure, side effects
  included; `--skip-dependencies` reruns only the named test. If a producer failed
  in the same closure, the consumer's failure is starvation (missing token/fixture)
  — triage the producer first; it does not implicate your change.
- `create` and `--wait` output include a `dashboardUrl` — if the user wants to
  inspect a test or run themselves, point them there.

### 4. On failure — download the artifact

```bash
testsprite test artifact get <run-id> --out ./.testsprite/runs/<run-id>/
```

Inspect the bundle (failing step, screenshots, root-cause hypothesis) before
deciding whether your change caused the failure.

### 5. One more tool — dry-run for learning

Every command works without credentials under `--dry-run`:

```bash
testsprite test run <test-id> --dry-run --output json
testsprite test create --plan-from plan.json --dry-run --output json
```

## Exit-code quick reference

| Code | Meaning                                           |
| ---- | ------------------------------------------------- |
| 0    | Success (passed)                                  |
| 1    | Failed / blocked / cancelled                      |
| 3    | Auth error                                        |
| 4    | Not found                                         |
| 5    | Validation error                                  |
| 6    | Conflict (already running)                        |
| 7    | Timeout — resume: `testsprite test wait <run-id>` |
| 11   | Rate limited (retriable)                          |
| 12   | Insufficient credits                              |

## Bootstrap (first-time setup)

```bash
npm install -g @testsprite/testsprite-cli
testsprite setup         # configure + verify + install agent skill in one shot
```

Verify your setup anytime: `testsprite auth status`.

**First-time setup:** if this repo has no TestSprite tests yet, seed a *broad* first suite across its main user flows — not just one test — each with a concrete, observable assertion, before reporting setup as done.
<!-- END TESTSPRITE AGENT SECTION -->
