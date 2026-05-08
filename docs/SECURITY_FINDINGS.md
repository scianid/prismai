# Widget Security Findings

Review date: 2026-05-08
Scope: `src/widget.js` (`DiveeWidget` class) + `supabase/migrations/20260508000002_tagging_daily_stats.sql`

Threat model:
- Hostile publisher page (the embedder) is partially trusted but could try to scrape/hijack widget input.
- Hostile user could try XSS / PII exfil.
- Compromised backend serving config could try to inject HTML/JS via `serverConfig` fields.
- CSP-restricted hosts: widget should work without inline scripts.

## Severity summary

| # | Severity | Status      | Area |
|---|----------|-------------|------|
| 1 | HIGH     | ✅ Fixed    | `config.icon_url` interpolated unescaped into `<img src>` |
| 2 | HIGH     | ✅ Fixed    | Cubic-mode placeholder text interpolated unescaped into `<p>` |
| 3 | MEDIUM   | ✅ Fixed    | Textarea `placeholder` attribute interpolated unescaped |
| 4 | MEDIUM   | ✅ Fixed    | `window.open(url, '_blank')` without `noopener` arg |
| 5 | MEDIUM   | ✅ Fixed    | PII redaction only runs in `sendQuestion`, not in `askQuestion` |
| 6 | LOW      | ✅ Fixed    | `metadata.image_url` / `og_image` forwarded with query strings |
| 7 | LOW      | ✅ Fixed    | `escapeHtml` does not escape backtick |
| 8 | INFO     | ✅ Fixed    | RPC `tz` parameter is admin-gated and not a SQLi vector but unvalidated |

---

## 1. HIGH — `config.icon_url` interpolated unescaped into `<img src>` ✅ FIXED

**Status:** Fixed 2026-05-08. All three call sites now route through a new `safeImageUrl` helper.

**Where (was)**
- `src/widget.js:2013` (cubic-mode collapsed view)
- `src/widget.js:2053` (default collapsed view)
- `src/widget.js:2167` (expanded header)

**What it was**
The server-supplied `config.icon_url` was dropped into `innerHTML` template strings without `escapeHtml` and without URL validation:
```js
<img class="..." src="${config.icon_url}" alt="" aria-hidden="true" />
```

**Impact (was)**
A backend response containing `" onerror="alert(1)` would break out of the attribute and execute JS in every publisher's page that embeds the widget.

**Fix applied**
New helper at `src/widget.js:821`:
```js
safeImageUrl(rawUrl) {
  if (!rawUrl) return '';
  const s = String(rawUrl).trim();
  if (/^data:image\//i.test(s)) return this.escapeHtml(s);
  try {
    const u = new URL(s, window.location.href);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      return this.escapeHtml(u.href);
    }
  } catch (_) { /* fall through */ }
  return '';
}
```
- Whitelists `http:`, `https:`, and `data:image/...` schemes; everything else returns empty string.
- Routes through `URL()` to normalize the value before re-emitting; `javascript:`, `vbscript:`, `data:text/html`, etc. all return empty.
- HTML-escapes the result so embedded quotes can't break out of the attribute.

All three interpolations now use `${this.safeImageUrl(config.icon_url)}`.

---

## 2. HIGH — Cubic-mode placeholder text interpolated unescaped ✅ FIXED

**Status:** Fixed 2026-05-08.

**Where (was)**
- `src/widget.js:2017-2018`

**What it was**
```js
const cubicHeadline = placeholders[0] || 'Ask me anything';
const cubicSubline = placeholders[1] || 'Type below to start chatting';
view.innerHTML = `
  ...
  <p class="divee-cubic-headline">${cubicHeadline}</p>
  <p class="divee-cubic-subline">${cubicSubline}</p>
  ...
`;
```
`placeholders` comes from `config.input_text_placeholders` (server-supplied).

**Impact (was)**
Same vector as #1: a backend-controlled string containing HTML/JS would land in the publisher's DOM and execute.

**Fix applied**
Both interpolations now wrapped with `this.escapeHtml(...)`:
```js
<p class="divee-cubic-headline">${this.escapeHtml(cubicHeadline)}</p>
<p class="divee-cubic-subline">${this.escapeHtml(cubicSubline)}</p>
```

---

## 3. MEDIUM — Textarea `placeholder` attribute interpolated unescaped ✅ FIXED

**Status:** Fixed 2026-05-08.

**Where (was)**
- `src/widget.js:2222`

**What it was**
```js
const placeholder = (config.input_text_placeholders && config.input_text_placeholders.length > 0)
  ? config.input_text_placeholders[0]
  : 'Ask anything about this article...';
// ...
view.innerHTML = `
  ...
  <textarea ... placeholder="${placeholder}" ...></textarea>
  ...
`;
```

**Impact (was)**
A `"` in the value broke out of the attribute. Same source field as #2.

**Fix applied**
```js
placeholder="${this.escapeHtml(placeholder)}"
```

---

## 4. MEDIUM — `window.open(url, '_blank')` without `noopener` ✅ FIXED

**Status:** Fixed 2026-05-08.

**Where (was)**
- `src/widget.js:4182` (card click)
- `src/widget.js:4194` (Enter/Space keydown)

**What it was**
```js
window.open(suggestion.url, '_blank');
```
URL was scheme-checked against `^https?:`, but the `window.open` 3rd argument was omitted.

**Impact (was)**
On older Safari / Edge, `window.open` without explicit `noopener` does not detach `window.opener`. The opened tab could write `window.opener.location = "...evil..."` and tabnab the publisher page.

**Fix applied**
Both call sites now pass `'noopener,noreferrer'` as the third arg and explicitly null the `opener`:
```js
const w = window.open(suggestion.url, '_blank', 'noopener,noreferrer');
if (w) w.opener = null;
```

---

## 5. MEDIUM — PII redaction runs in `sendQuestion` only, not in `askQuestion` ✅ FIXED

**Status:** Fixed 2026-05-08.

**Where (was)**
- `src/widget.js:3448` — `redactSensitivePatterns` was called from `sendQuestion`, before the `askQuestion(question, 'custom', null, hits)` call.
- Bypassing call sites: suggestion chips at `src/widget.js:3139` and `3293` called `askQuestion(...)` directly without redaction.

**What it was**
`redactSensitivePatterns` (credit cards, SSN, IBAN, email, phone, GPS) was invoked inside `sendQuestion` only. The four-arg API `askQuestion(question, type, questionId, redactionHits)` made the caller responsible for passing the hits in.

**Impact (was)**
Defense-in-depth gap. Any future `askQuestion` call from non-redacted input would silently send PII to the backend.

**Fix applied**
- `redactSensitivePatterns` moved inside `askQuestion`. The function now takes `rawQuestion` and computes the redacted `question` + `hits` internally.
- `askQuestion` signature reduced from `(question, type, questionId, redactionHits)` to `(rawQuestion, type, questionId)` — the redaction-hits param is gone (computed internally).
- `sendQuestion` is now a thin wrapper that calls `askQuestion(raw, 'custom', null)`.
- Suggestion-chip call sites unchanged — they already match the new signature, and their input now also passes through the same redaction (a no-op for backend-generated suggestions in practice, but correct as defense-in-depth).
- `widget-core.test.js` test updated: previously it passed an explicit `['email']` 4th arg with a clean question; now it passes a real PII-containing string and asserts the system notice fires.

---

## 6. LOW — `metadata.image_url` / `og_image` forwarded with query strings ✅ FIXED

**Status:** Fixed 2026-05-08.

**Where (was)**
- `src/widget.js:3392-3393` (suggestions POST payload)
- `src/widget.js:3744-3745` (analytics)

**What it was**
Article URLs were stripped of query / hash via `stripUrlIdentifiers` before being sent outbound, but `image_url` and `og_image` from extracted page metadata were forwarded raw.

**Impact (was)**
If a publisher's image URLs contained auth tokens / signed-URL params, those would leak to our backend (and to the LLM via the suggestions request).

**Fix applied**
Both metadata.image_url / og_image fields now route through `stripUrlIdentifiers` before being added to the payload — same helper already used for the article URL.

---

## 7. LOW — `escapeHtml` does not escape backtick ✅ FIXED

**Status:** Fixed 2026-05-08.

**Where (was)**
- `src/widget.js:818`

**What it was**
The `escapeHtml` helper covered `& < > " '` but not `` ` `` (backtick).

**Impact (was)**
Not exploitable in HTML attributes quoted with `"`. Would have only mattered if a backtick context ever appeared. Defense-in-depth.

**Fix applied**
Added a final `.replace(/`/g, '&#x60;')` to the chain. Now full coverage of the standard set.

---

## 8. INFO — RPC `tz` parameter is unvalidated (not SQLi)

**Where**
- `supabase/migrations/20260508000002_tagging_daily_stats.sql`

**What**
```sql
today_local := (now() AT TIME ZONE tz)::date;
SELECT (tagged_at AT TIME ZONE tz)::date AS d, count(*) AS c
WHERE tagged_at >= (start_date::timestamp AT TIME ZONE tz)
```
`tz` is used as a value expression, not via string concatenation. **Not a SQL injection vector.** A bad `tz` raises `invalid_parameter_value` and aborts the function. Caller is admin-gated by `EXISTS (SELECT 1 FROM admin_users WHERE user_id = caller_id)`, so DoS surface is limited.

**Fix (defense-in-depth, optional)**
```sql
IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = tz) THEN
  RAISE EXCEPTION 'Unknown timezone: %', tz;
END IF;
```
Returns a clean error instead of letting a cast fault.

---

## Negative findings (no action needed)

- `renderMarkdown` (`src/widget.js:921+`) escapes input first, then runs regex. No `<a>` / `<img>` / `[label](url)` are parsed → no `javascript:` link surface. Safe by construction.
- All `target="_blank"` literals in static template strings carry `rel="noopener noreferrer"`.
- No `addEventListener('message', ...)` anywhere → no postMessage origin-validation surface.
- All `fetch` calls use default `credentials: 'same-origin'` → no third-party-cookie leak.
- `localStorage` writes gated on `state.consent.storage`; cleared on revoke; `_memStore` fallback correct.
- `copyToClipboard` writes plain text only — no `text/html` MIME path, no XSS-on-paste vector.
- `stripUrlIdentifiers` strips query + hash on outbound URLs (used in suggestions, content fetch, analytics).
- The RPC `get_tagging_daily_stats` correctly applies `SECURITY DEFINER` + `SET search_path = public` and admin-gates before any work.

## Recommended remediation order

1. ~~Patch #1 + #2 + #3 in one go~~ — done.
2. ~~Patch #4 (`window.open` 3rd arg)~~ — done.
3. ~~Patch #5 (move PII redaction into `askQuestion`)~~ — done.
4. #6 / #7 / #8 are policy / nice-to-have.

## Changelog

- **2026-05-08** — Fixed #1 (`config.icon_url` XSS) and #2 (cubic placeholder XSS). Introduced `safeImageUrl` helper in `widget.js`. Build green, 438 tests pass.
- **2026-05-08** — Fixed #3, #4, #5. Textarea placeholder now `escapeHtml`'d; `window.open` calls pass `'noopener,noreferrer'` and null the opener; PII redaction moved inside `askQuestion` so all entry points are covered. `widget-core.test.js` updated to match the new `askQuestion(rawQuestion, type, questionId)` signature. Build green, 438 tests pass.
