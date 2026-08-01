# Security notes

- Never commit Gemini API keys, Cloudflare API tokens, `.env`, or `.dev.vars` files.
- Configure `GEMINI_API_KEY` only as a Cloudflare Worker Secret after deployment is approved.
- The Worker accepts JSON only, limits request bytes before parsing, validates the body with Zod, and never logs report text.
- Rate limits use both Cloudflare-provided client IP and an anonymous browser token; idempotency responses are short-lived in KV.
- IP and anonymous-token values are SHA-256 hashed before being used in KV keys.
- Cloudflare KV is eventually consistent and does not provide atomic increments. The counters are a cost-abuse guard for this low-volume MVP, not a strict security boundary; move counters to a Durable Object if strict global enforcement becomes required.
- The MVP does not retain submitted report text or uploaded files. Cloudflare KV is used only for counters and successful idempotency responses with a 10-minute TTL; those responses can contain short evidence excerpts returned by AI.
- Daily controls limit both request count and planned input tokens. They are safety caps, not a billing-system replacement; keep Google Cloud budget alerts enabled.
- Static Pages responses define CSP, frame restrictions, MIME sniffing protection, referrer policy, and permissions policy in `public/_headers`.
- Rotate any key exposed outside a secrets manager before production use.
