# Testing report

สถานะล่าสุดของ production verification: **ผ่านครบทุก automated quality gate ที่กำหนดไว้**

วันที่ตรวจล่าสุด: 2 สิงหาคม 2026  
Repository: [WayuOHm99/report-checker-ai](https://github.com/WayuOHm99/report-checker-ai)  
Live URL: [https://reportcheckxd.pages.dev/](https://reportcheckxd.pages.dev/)

## Results

| Layer | Command/tool | Result |
| --- | --- | --- |
| Static analysis | `npm run lint` | passed |
| Unit/component | `npm run test` | 49/49 passed |
| Production build | `npm run build` | passed |
| Browser E2E | `npm run test:e2e` | 28/28 passed |
| Production FE suite | TestSprite CLI | 10/10 passed |

Playwright run ครอบคลุม Chromium, Mobile Chrome, Firefox และ WebKit โดยมี flow สำหรับ text analysis, empty state, responsive layout, Thai PDF text layer, scanned PDF warning, multi-column warning และ appendix confirmation

## TestSprite coverage

TestSprite project มี 10 scenarios:

1. หน้าแรกและ empty state
2. short report warning
3. text report analysis และ result rendering
4. clear draft
5. template switching
6. advanced rubric editor
7. invalid rubric weight
8. appendix confirmation/cancel/confirm
9. privacy notice และ Google policy link
10. mobile viewport, overflow และ touch target dimensions

TestSprite run ล่าสุดที่สำคัญ:

- [Appendix dialog — 5/5 steps passed](https://www.testsprite.com/dashboard/tests/c76aad7a-c7f9-44a8-a888-a842a4cd386e/test/4d532c92-e129-42bb-b8f3-51259d0f2c1d)
- [Mobile layout — 5/5 steps passed](https://www.testsprite.com/dashboard/tests/c76aad7a-c7f9-44a8-a888-a842a4cd386e/test/45c45e32-b274-438e-95e6-35cdca4114c7)

## What is and is not certified

การทดสอบยืนยัน behavior ของ UI, validation, request flow และ deployment smoke path ด้วยข้อมูลสังเคราะห์เท่านั้น ไม่ได้ยืนยันว่า AI ให้คะแนนรายงานจริงถูกต้องตามหลักวิชาการ และไม่ใช่การรับรอง plagiarism หรือ PDPA compliance

## Reproduce locally

```bash
npm ci
npm run lint
npm run test
npm run build
npx playwright install --with-deps
npm run test:e2e
```

อย่าใช้ข้อมูลรายงานจริงหรือข้อมูลส่วนบุคคลในการรัน test suite
