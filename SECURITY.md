# Security notes

- Never commit Gemini API keys, Cloudflare API tokens, `.env`, or `.dev.vars` files.
- Configure `GEMINI_API_KEY` only as a Cloudflare Worker Secret after deployment is approved.
- The Worker accepts JSON only, limits request bytes before parsing, validates the body with Zod, and never logs report text.
- Rate limits use both Cloudflare-provided client IP and an anonymous browser token; idempotency responses are short-lived in KV.
- The MVP does not retain submitted report text or uploaded files. Cloudflare KV is used only for counters and short-lived idempotency responses.
- Rotate any key exposed outside a secrets manager before production use.
