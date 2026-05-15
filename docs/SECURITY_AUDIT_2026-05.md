# Security Audit — 2026-05

Source-level penetration review of the divee widgets and the
`supabase/functions/` edge layer. Covers the embeddable widgets
(`divee-widget`, `divee-worldcup`), the HTTP edge endpoints, the shared
infrastructure layer, and the worldcup MCP backend.

Companion docs: [SECURITY_AUDIT_TODO.md](SECURITY_AUDIT_TODO.md) (2026-04
review), [SECURITY_REVIEW.md](SECURITY_REVIEW.md),
[SECURITY_FINDINGS.md](SECURITY_FINDINGS.md).

## Legend

- **Severity**: 🔴 High — exploitable today · 🟠 Medium — hardening ·
  🟡 Low — audit polish · ⚪ Info — noted, no action.
- **Status**: `[ ]` open · `[x]` done · `[-]` won't fix (with reason).

---

## Status summary

| Tier | Total | Done | Open |
|------|-------|------|------|
| High | 5 | 1 | 4 |
| Medium | 6 | 1 | 5 |
| Low | 7 | 4 | 3 |
| Info | 2 | — | — |

---

## Done

### [x] Widget — unvalidated `article.url` on tag-popup cards
`divee-widget/src/widget.js:4625` — `<a href>` assigned a server-supplied
URL with no scheme check; a compromised `/articles/by-tag` response could
deliver a `javascript:` URL. Fixed: gated with `/^https?:\/\//i`.
Commit `08d3acf`.

### [x] Worldcup widget — unescaped match score in `innerHTML`
`divee-worldcup/widget/src/widget.js:1921` — score values concatenated raw
into card HTML, the lone field bypassing `escapeHtml`. Fixed: `escapeHtml`
applied. Commit `c500f69`.

### [x] Worldcup widget — sponsor `brand.href` / `brand.logoUrl` unvalidated
`applyTheme` set `<a href>` / `<img src>` from backend theme JSON with no
scheme check (`javascript:` href, `data:` src). Fixed: `https://`-only
allowlist. Commit `c500f69`.

### [x] H-3 — Origin allowlist fail-open
`origin.ts` lenient `isAllowedOrigin` returned `true` when both `Origin`
and `Referer` were absent, so a non-browser client (curl) bypassed the
allowlist on `config`, `analytics`, `articles`, `games-worldcup`,
`suggested-articles`, and `suggestions`-GET. Fixed: all six switched to
`isAllowedOriginStrict`. Commit `4af942c`.

### [x] M-1 — `/config` leaks `allowed_urls`
The `/config` response echoed `allowed_urls`, handing an attacker the exact
host to forge in a `Referer`. Fixed: field removed from the response;
consumers now use the dedicated encrypted `/allowed-urls` endpoint
(`allowlistCipher.ts`, AES-256-GCM). Commit `4af942c`.

---

## 🔴 High — open

### [ ] H-1 — IDOR: conversation DAOs trust caller-supplied conversation IDs
**Where:** `_shared/dao/conversationDao.ts:122` (`getConversationById`),
`:200` (`getSuggestionIndex`), `:218` (`updateSuggestionIndex`), `:232`
(`deleteConversation`), `:89` (`appendMessagesToConversation`).
**What:** these query/mutate `conversations` solely by `.eq("id", …)` with
no `project_id` / `visitor_id` scope. The service-role client bypasses RLS,
so a guessed or leaked conversation UUID lets an attacker read another
visitor's full chat transcript, append messages, or delete the
conversation. `X-Conversation-Id` is reflected to the client, so IDs leak
by design.
**Fix:** add `.eq("project_id", projectId)` (and `visitor_id` where known)
to every by-ID conversation query/update/delete; plumb `projectId` through
the calling handlers.
**SOC2:** CC6.1 (logical access).

### [ ] H-2 — IDOR: article / freeform-QA DAOs not tenant-scoped
**Where:** `_shared/dao/articleDao.ts:115` (`getArticlesByIds`), `:199`
(`updateArticleCache`), `:211` (`updateArticleImage`), `:223`
(`updateCacheAnswer`); `_shared/dao/freeformQaDao.ts:74`
(`getFreeformQasByArticle`), `:50` (`updateFreeformAnswer`).
**What:** by-ID select/update with no `project_id` filter. Cross-tenant
article disclosure and cache poisoning. Mitigating factor: `unique_id`
embeds the projectId, but projectId is a public widget attribute.
**Fix:** add `.eq("project_id", projectId)` to all; plumb `projectId`
through.
**SOC2:** CC6.1.

### [ ] H-4 — No hard per-project LLM cost ceiling
**Where:** `chat/index.ts:153`, `chat-worldcup/index.ts:133`.
**What:** an attacker with a `projectId` and a forged `Referer` drives paid
OpenAI calls billed to that tenant. The rate limit (500/project/min) caps
*rate* but not sustained spend — ~720k calls/day indefinitely.
**Fix:** enforce a hard daily/monthly token budget per project before
`streamAnswer`; the `tokenUsageDao` data already exists to drive it. Alert
on spend spikes.
**SOC2:** A1.1 (availability / capacity).

### [ ] H-5 — Origin allowlist is forgeable (design limitation)
**Where:** `origin.ts` — `Origin`/`Referer` are attacker-controlled from
non-browser clients.
**What:** the origin allowlist is the de-facto auth boundary for
unauthenticated endpoints, and it is forgeable. Partly mitigated: H-3
(strict) and M-1 (no `allowed_urls` leak) raise the bar.
**Fix:** do not rely on origin as the boundary for anything that costs
money or crosses tenants — that is what H-1/H-2/H-4 address. Longer term:
signed short-lived tokens minted by `/config` and required by `/chat`.
**SOC2:** CC6.1.

---

## 🟠 Medium — open

### [ ] M-2 — `games-worldcup` `previewDate` is a public cache-bypassing override
**Where:** `games-worldcup/index.ts:338-360,410`.
**What:** `previewDate` lets any caller redefine "today" and sets
`s-maxage=0`, so iterating it forces unbounded uncached upstream SportsData
fetches.
**Fix:** gate `previewDate` behind an env flag or bypass token; never
expose a cache-busting param to anonymous callers.
**SOC2:** A1.1.

### [ ] M-3 — `games-worldcup` uncached BoxScore fan-out
**Where:** `games-worldcup/index.ts:269`.
**What:** `fetchDay` issues one uncached BoxScore fetch per in-progress
match; a single allowed request fans out to dozens of paid upstream calls.
**Fix:** cache BoxScore per `GameId` with a short TTL; cap `days` on the
live path.
**SOC2:** A1.1.

### [ ] M-4 — `chat` stores unvalidated `metadata.og_image` / `image_url`
**Where:** `chat/index.ts:246-247`.
**What:** publisher-supplied image URLs are stored via `updateArticleImage`
with no scheme check, then later rendered by the widget as `<img src>`.
**Fix:** validate as `https://` URLs — reuse `sanitizeHttpsUrl` from
`config/index.ts`.
**SOC2:** CC6.1.

### [ ] M-5 — `analytics` forwards client-supplied IP/origin raw
**Where:** `analytics/index.ts:133-140`.
**What:** `cf-connecting-ip` and `origin` are forwarded raw to the upstream
analytics proxy, letting a client poison geo/IP enrichment downstream.
**Fix:** re-derive `cf-connecting-ip` from the edge's trusted header only;
do not forward a client-supplied `origin`.
**SOC2:** CC7.2 (monitoring integrity).

### [ ] M-6 — Rate limiter fails open
**Where:** `_shared/rateLimit.ts:129-145`.
**What:** every DB-error path `continue`s / fails open, so an attacker who
induces DB errors disables rate limiting entirely — removing the only LLM
cost cap (compounds H-4). Keys also embed freely-rotatable `visitorId` and
spoofable IP headers.
**Fix:** fail-closed (or degraded-limit) on repeated DB errors for the
expensive `/chat` path; derive IP only from the trusted CDN header.
**SOC2:** A1.1.

---

## 🟡 Low — open

### [ ] L-1 — `widget-error` has no rate limit or origin check
**Where:** `widget-error/index.ts`.
**What:** anonymous internet can flood the Sentry quota; client stack
traces are stored verbatim and `console.log`-ed (log injection).
**Fix:** add an IP-keyed rate limit; newline-strip before logging.
**SOC2:** A1.1.

### [ ] L-2 — `suggestions` reflects raw `error.message` to clients
**Where:** `suggestions/index.ts:350,397`.
**What:** raw exception text returned to the client — possible internal
info leak; other endpoints return a generic message.
**Fix:** return a generic error; log detail server-side only.
**SOC2:** CC6.1.

### [ ] L-3 — `suggestions` logs raw `visitor_id` and `allowed_urls`
**Where:** `suggestions/index.ts:67-79`.
**What:** PII / config in logs; `chat` correctly hashes the visitor,
`suggestions` does not.
**Fix:** hash `visitor_id` via `logSafe`; drop `allowed_urls` from logs.
**SOC2:** CC6.1 / privacy.

### [ ] L-4 — `chat` IDs unvalidated (type / length)
**Where:** `chat/index.ts:113`.
**What:** `visitor_id` / `session_id` / `questionId` accepted without a
`typeof`/length check; a 200KB `visitor_id` becomes a 200KB rate-limit key.
**Fix:** `typeof === "string"` + length caps on all IDs.
**SOC2:** CC6.1.

### [-] L-5 — `enforceContentLength` trusts `Content-Length`
`responses.ts:56` — advisory only; post-read truncation mitigates. Won't
fix — accepted, documented in the function's own comment.

### [ ] L-6 — `classifySensitive` relies on caller length-clamping
**Where:** `_shared/classifySensitive.ts:86`.
**What:** `HEALTH_RE` backtracking is bounded only if input is ≤200 chars,
which the function does not enforce itself.
**Fix:** add a defensive `text.slice(0, 200)` inside `classifySensitive`.
**SOC2:** A1.1.

### [ ] L-7 — `scrubUrlParams` misses path-segment tokens
**Where:** `_shared/scrubUrlParams.ts:74-85`.
**What:** only top-level query keys are scrubbed; tokens in path segments
or nested `redirect_uri=` URLs reach analytics/Sentry.
**Fix:** add a path-pattern pass for JWT-shaped strings.
**SOC2:** CC6.1 / privacy.

---

## ⚪ Info

### CONFIG_BYPASS_KEY stale fallback
`_shared/analytics.ts:47,131` — `CONFIG_BYPASS_KEY` is the fallback for
`ANALYTICS_PROXY_API_KEY`, which is currently **not set**, so the fallback
is load-bearing. Migration: set `ANALYTICS_PROXY_API_KEY` on both projects,
update the secondary verifier, then delete `CONFIG_BYPASS_KEY`. Distinct
from `CONFIG_BYPASS_SECRET` (HMAC for `/config` `bypass_token`).

### MCP CORS wildcard
`divee-worldcup/mcp-sportsdata/server.js:96` — `Access-Control-Allow-Origin:
*`. Mitigated: every `/mcp` request requires a `Bearer MCP_SECRET`
(constant-time compare) the browser cannot attach cross-origin. Acceptable
for a token-gated API; tighten to known origins for defense-in-depth.

---

## Verified safe (coverage)

- **No SQL injection** — all DB access via the supabase-js query builder
  with parameter-bound `.eq/.in`; `.rpc()` calls use named params.
- **No SSRF** — `fetch` targets are hardcoded provider URLs or server-env
  values; no user-controlled fetch destination.
- **No `eval` / `new Function` / dynamic script** — only injected scripts
  are hardcoded Google GPT/IMA constants. `build.js` esbuild `define` uses
  `JSON.stringify`.
- **No `postMessage`** gaps — neither widget uses `postMessage` or a
  `message` listener.
- **Markdown renderers** (both widgets) — `escapeHtml` runs before regex
  processing; link URLs gated to `https?:`/`mailto:`; no raw HTML
  passthrough.
- **No prototype pollution** — merge helpers build fresh objects from known
  keys; theme merge iterates a fixed `varMap`.
- **CSS theme injection** — color values via `style.setProperty`; hex
  pre-validated by strict regex.
- **`configBypassToken.ts`** — HMAC-SHA256, constant-time compare, 1h TTL.
- **CORS** — `*` but no `Allow-Credentials`; widget sends no cookies.
- **ReDoS** — `ragChunker`, `sanitizeContent`, classify regexes linear /
  bounded.
- **Secrets** — API keys from `Deno.env`, never logged or returned;
  widget bundles contain no secrets.
- **Body-size caps** — every body endpoint calls `enforceContentLength`
  before `req.json()`.
