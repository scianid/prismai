/**
 * Tests for supabase/functions/_shared/scrubUrlParams.ts (I6 mitigation).
 *
 * The scrubber's contract:
 *   - Absolute URLs: blocked query params stripped; `key=value`-shaped
 *     fragments dropped; everything else preserved.
 *   - Root-relative URLs: same, but the scheme/host placeholder is not
 *     leaked into the output.
 *   - Non-URL strings: returned unchanged.
 *   - Recursion: `scrubValue` walks nested objects and arrays.
 */
import { assertEquals } from "jsr:@std/assert@1";
import { scrubUrl, scrubValue } from "../_shared/scrubUrlParams.ts";

// ── scrubUrl: absolute URLs ───────────────────────────────────────────────

Deno.test("scrubUrl: strips default PII params from absolute URL", () => {
  assertEquals(
    scrubUrl("https://a.com/x?email=foo@bar.com&id=1"),
    "https://a.com/x?id=1",
  );
  assertEquals(
    scrubUrl("https://a.com/x?token=abc&q=keep"),
    "https://a.com/x?q=keep",
  );
  assertEquals(
    scrubUrl("https://a.com/x?password=p&ok=1"),
    "https://a.com/x?ok=1",
  );
});

Deno.test("scrubUrl: matching is case-insensitive", () => {
  assertEquals(
    scrubUrl("https://a.com/?EMAIL=foo&Token=bar&ok=1"),
    "https://a.com/?ok=1",
  );
});

Deno.test("scrubUrl: strips key=value fragments (OAuth implicit flow)", () => {
  assertEquals(
    scrubUrl("https://a.com/cb#access_token=xyz&type=bearer"),
    "https://a.com/cb",
  );
});

Deno.test("scrubUrl: preserves non-key=value fragments (e.g. section anchors)", () => {
  assertEquals(
    scrubUrl("https://a.com/article#section-2"),
    "https://a.com/article#section-2",
  );
});

Deno.test("scrubUrl: returns input unchanged when nothing to strip", () => {
  // No `?` or `#` → fast path, input returned byte-identical.
  assertEquals(scrubUrl("https://a.com/article"), "https://a.com/article");
  // Has `?` but no blocked keys → still mutated=false, original returned.
  assertEquals(
    scrubUrl("https://a.com/?utm_source=newsletter&q=1"),
    "https://a.com/?utm_source=newsletter&q=1",
  );
});

Deno.test("scrubUrl: removes all PII params while keeping the rest", () => {
  assertEquals(
    scrubUrl("https://a.com/?email=x&token=y&id=1&utm=abc"),
    "https://a.com/?id=1&utm=abc",
  );
});

// ── scrubUrl: relative URLs ───────────────────────────────────────────────

Deno.test("scrubUrl: strips PII from root-relative URLs without leaking placeholder", () => {
  assertEquals(
    scrubUrl("/path?email=foo&id=1"),
    "/path?id=1",
  );
  assertEquals(
    scrubUrl("/path?token=abc#section"),
    "/path#section",
  );
});

// ── scrubUrl: degenerate input ────────────────────────────────────────────

Deno.test("scrubUrl: non-URL string with '?' returns unchanged", () => {
  // "what? no" is not a valid URL even with a base — scrubber bails out.
  const s = "what? no";
  assertEquals(scrubUrl(s), s);
});

Deno.test("scrubUrl: non-string input returned as-is", () => {
  // Runtime guard against accidental misuse from loosely-typed call sites.
  // deno-lint-ignore no-explicit-any
  assertEquals(scrubUrl(null as any), null);
  // deno-lint-ignore no-explicit-any
  assertEquals(scrubUrl(undefined as any), undefined);
});

// ── scrubUrl: custom block list ───────────────────────────────────────────

Deno.test("scrubUrl: custom block list overrides defaults", () => {
  const blocked = new Set(["foo"]);
  // `email` is in the default list but NOT the custom list → preserved.
  assertEquals(
    scrubUrl("https://a.com/?email=keep&foo=strip", blocked),
    "https://a.com/?email=keep",
  );
});

// ── scrubValue: recursion ─────────────────────────────────────────────────

Deno.test("scrubValue: walks nested objects", () => {
  const input = {
    article_url: "https://a.com/?email=x&id=1",
    event_data: {
      url: "https://a.com/cb#access_token=abc",
      inner: { deeper: "https://a.com/?token=y" },
    },
    untouched: 42,
  };
  assertEquals(scrubValue(input), {
    article_url: "https://a.com/?id=1",
    event_data: {
      url: "https://a.com/cb",
      inner: { deeper: "https://a.com/" },
    },
    untouched: 42,
  });
});

Deno.test("scrubValue: walks arrays", () => {
  assertEquals(
    scrubValue([
      "https://a.com/?email=1",
      "https://a.com/?id=2",
      { nested: "https://a.com/?token=3" },
    ]),
    [
      "https://a.com/",
      "https://a.com/?id=2",
      { nested: "https://a.com/" },
    ],
  );
});

Deno.test("scrubValue: leaves non-URL strings unchanged", () => {
  // A user's email inside event_data would be a real concern, but that's
  // out of scope for this URL-focused scrubber — it only touches strings
  // that parse as URLs with query/fragment components.
  assertEquals(scrubValue({ name: "Ada", age: 36 }), { name: "Ada", age: 36 });
});

Deno.test("scrubValue: preserves primitive types", () => {
  assertEquals(scrubValue(null), null);
  assertEquals(scrubValue(true), true);
  assertEquals(scrubValue(0), 0);
});
