# Security notes

## Reporting a vulnerability

Email `oomzazato01@gmail.com` with the affected URL, the steps to reproduce and the impact you
observed. If that address bounces, open an issue at
[github.com/WayuOHm99/rubriclens-ai/issues](https://github.com/WayuOHm99/rubriclens-ai/issues) with
no exploit details and ask for a private channel. This is a personal project with no SLA; expect a
best-effort reply. Please do not run load tests or automated scanners against the live deployment —
its budget guards are a cost cap, not a defence, and exhausting them takes the site down for
everyone.

The contact address is defined once in `src/lib/site-info.ts` and rendered on `/privacy` and
`/terms`; keep all three in step.

## Notes

- Never commit Gemini API keys, Cloudflare API tokens, `.env`, or `.dev.vars` files.
- Configure `GEMINI_API_KEY` only as a Cloudflare Worker Secret after deployment is approved.
- The Worker accepts JSON only, limits request bytes before parsing, validates the body with Zod, and never logs report text.
- Rate limits use both Cloudflare-provided client IP and an anonymous browser token; idempotency responses are short-lived in KV.
- IP and anonymous-token values are SHA-256 hashed before being used in KV keys.
- The idempotency key is never used as a KV key directly. The key is SHA-256 hashed to form the KV key, and the stored record holds a SHA-256 digest of the canonical request plus the serialized response.
- The request body is read and validated **before** any cache lookup, so a malformed or differently shaped request can never read back a cached result. Reusing an idempotency key with a different payload returns `409 IDEMPOTENCY_CONFLICT` rather than another document's result.
- Cloudflare KV is eventually consistent and does not provide atomic increments. The counters are a cost-abuse guard for this low-volume MVP, not a strict security boundary; move counters to a Durable Object if strict global enforcement becomes required.
- The MVP does not retain submitted report text or uploaded files. Cloudflare KV is used only for counters and successful idempotency responses with a 10-minute TTL.
- The browser stores exactly two things: an anonymous rate-limit token in `localStorage` and the working draft in `sessionStorage`. Both key names live in `src/lib/browser-storage.ts`, which is also what the published privacy policy renders, so the disclosure cannot drift from the code. No cookies are set and no analytics or third-party scripts are loaded (`public/_headers` restricts `script-src` to `'self'`).
- **What a cached idempotency response can contain:** the analysis result the user already received. That result includes short evidence excerpts that the model quoted or paraphrased from the document, so a limited amount of document-derived text is stored for up to 10 minutes. It does **not** contain the original full document, the uploaded file, or the raw request body — only the request digest is stored for replay comparison, and a digest cannot be reversed into text.
- Document text sent to the model, findings returned by the model, and rubric content are all treated as untrusted data in both the chunk pass and the consolidation pass; prompts state this explicitly and instruct the model to ignore embedded instructions.
- A section the model marks `not_applicable` has its evidence and gaps cleared server-side, so fabricated excerpts cannot ride along on a section that was removed from the score.
- Daily controls limit request count and reserve a conservative token estimate before every application-level model call. Prompt tokens come from `countTokens`; output tokens use an enforced rubric-sized `maxOutputTokens` cap. JSON validation retries, consolidation, and fallback-model reruns each receive a separate reservation. Provider-internal SDK retries are not observable here, so this is a cost-abuse cap rather than billing-accurate accounting; keep Google Cloud budget alerts enabled.
- PDF input is bounded by both file size (10 MB) and page count (400 pages). The page count is checked immediately after the document is opened and before any page is processed, so a small file with a very large page count cannot exhaust the browser tab.
- Static Pages responses define CSP, frame restrictions, MIME sniffing protection, referrer policy, and permissions policy in `public/_headers`.
- `npm run audit:prod` (`npm audit --omit=dev --audit-level=high`) runs in CI and fails the build on a high or critical advisory in runtime dependencies.
- Rotate any key exposed outside a secrets manager before production use.
