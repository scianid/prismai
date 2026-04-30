/**
 * Tests for supabase/functions/_shared/classifySensitive.ts
 *
 * Two invariants we lock in:
 *   1. Personal-disclosure phrasing fires the right Art. 9 category and
 *      redacts the matched span. False negatives are acceptable for v1
 *      (this is a backstop, not a complete classifier) but the high-
 *      confidence patterns must reliably trip.
 *   2. Demographic / topical mentions in NON-disclosure contexts pass
 *      through. We are explicitly NOT a keyword filter — "Christian Bale",
 *      "Black Friday", "diabetes treatment guide" must not be redacted.
 */
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { classifySensitive } from "../_shared/classifySensitive.ts";

// ─── Health ────────────────────────────────────────────────────────────────

Deno.test("health: 'I have HIV' is detected and redacted", () => {
  const r = classifySensitive("I have HIV and I'm doing fine");
  assertEquals(r.hits, ["health"]);
  assertStringIncludes(r.text, "[redacted]");
  assertEquals(r.text.includes("HIV"), false);
});

Deno.test("health: 'my diabetes' is detected", () => {
  const r = classifySensitive("How does my diabetes affect insulin needs?");
  assertEquals(r.hits.includes("health"), true);
});

Deno.test("health: 'I was diagnosed with cancer' is detected", () => {
  const r = classifySensitive("I was diagnosed with cancer last year");
  assertEquals(r.hits.includes("health"), true);
});

Deno.test("health: 'I'm pregnant' is detected", () => {
  const r = classifySensitive("I'm pregnant — what should I avoid?");
  assertEquals(r.hits.includes("health"), true);
});

Deno.test("health: topical mention without first-person disclosure passes through", () => {
  // "How is diabetes treated?" — informational, no personal disclosure
  const r = classifySensitive("How is diabetes treated worldwide?");
  assertEquals(r.hits, []);
  assertEquals(r.text, "How is diabetes treated worldwide?");
});

// ─── Religion ──────────────────────────────────────────────────────────────

Deno.test("religion: 'I'm Catholic' is detected", () => {
  const r = classifySensitive("I'm Catholic and I want a recipe for Lent");
  assertEquals(r.hits, ["religion"]);
});

Deno.test("religion: 'I am a practicing Muslim' is detected", () => {
  const r = classifySensitive("I am a practicing Muslim during Ramadan");
  assertEquals(r.hits.includes("religion"), true);
});

Deno.test("religion: 'Christian Bale' (proper noun) does NOT trip religion", () => {
  // Critical false-positive test: actor name, not a disclosure.
  const r = classifySensitive("Tell me about Christian Bale movies");
  assertEquals(r.hits, []);
  assertEquals(r.text, "Tell me about Christian Bale movies");
});

Deno.test("religion: 'Christian rock band' does NOT trip religion", () => {
  const r = classifySensitive("Recommend a Christian rock band");
  assertEquals(r.hits, []);
});

// ─── Politics ──────────────────────────────────────────────────────────────

Deno.test("politics: 'I voted Republican' is detected", () => {
  const r = classifySensitive("I voted Republican last election");
  assertEquals(r.hits.includes("politics"), true);
});

Deno.test("politics: 'I'm a Democrat' is detected", () => {
  const r = classifySensitive("I'm a Democrat looking for sources");
  assertEquals(r.hits.includes("politics"), true);
});

Deno.test("politics: 'liberal arts' does NOT trip politics", () => {
  const r = classifySensitive("Best liberal arts colleges in the US");
  assertEquals(r.hits, []);
});

Deno.test("politics: 'conservative estimate' does NOT trip politics", () => {
  const r = classifySensitive("What's a conservative estimate for the budget?");
  assertEquals(r.hits, []);
});

// ─── Sex / orientation ─────────────────────────────────────────────────────

Deno.test("sex: 'I am gay' is detected", () => {
  const r = classifySensitive("I am gay and looking for advice");
  assertEquals(r.hits, ["sex"]);
});

Deno.test("sex: 'I'm transgender' is detected", () => {
  const r = classifySensitive("I'm transgender and considering treatment");
  assertEquals(r.hits.includes("sex"), true);
});

Deno.test("sex: topical mention 'gay marriage history' does NOT fire", () => {
  const r = classifySensitive("Tell me about gay marriage history");
  assertEquals(r.hits, []);
});

// ─── Race ──────────────────────────────────────────────────────────────────

Deno.test("race: 'I am African-American' is detected", () => {
  const r = classifySensitive("I am African-American and want to learn my heritage");
  assertEquals(r.hits.includes("race"), true);
});

Deno.test("race: 'Black Friday' does NOT fire", () => {
  const r = classifySensitive("Best Black Friday deals on laptops");
  assertEquals(r.hits, []);
});

Deno.test("race: 'Asian cuisine' does NOT fire", () => {
  const r = classifySensitive("Asian cuisine restaurants in NYC");
  assertEquals(r.hits, []);
});

// ─── Union ─────────────────────────────────────────────────────────────────

Deno.test("union: 'I am a union member' is detected", () => {
  const r = classifySensitive("I am a union member, what are my rights?");
  assertEquals(r.hits.includes("union"), true);
});

Deno.test("union: 'European Union' (geopolitical) does NOT fire", () => {
  const r = classifySensitive("How does the European Union work?");
  assertEquals(r.hits, []);
});

// ─── Criminal ──────────────────────────────────────────────────────────────

Deno.test("criminal: 'I was arrested' is detected", () => {
  const r = classifySensitive("I was arrested last year, can I expunge it?");
  assertEquals(r.hits.includes("criminal"), true);
});

Deno.test("criminal: 'my criminal record' is detected", () => {
  const r = classifySensitive("How do I clear my criminal record?");
  assertEquals(r.hits.includes("criminal"), true);
});

Deno.test("criminal: topical 'criminal justice reform' does NOT fire", () => {
  const r = classifySensitive("Explain criminal justice reform debates");
  assertEquals(r.hits, []);
});

// ─── Combinatorics + edge cases ───────────────────────────────────────────

Deno.test("multiple categories in one string fire independently", () => {
  const r = classifySensitive(
    "I'm Catholic, I have HIV, and I voted Democrat",
  );
  assertEquals(r.hits.length >= 3, true);
  assertEquals(r.hits.includes("religion"), true);
  assertEquals(r.hits.includes("health"), true);
  assertEquals(r.hits.includes("politics"), true);
});

Deno.test("clean text returns unchanged", () => {
  const input = "What is the difference between TCP and UDP?";
  const r = classifySensitive(input);
  assertEquals(r.text, input);
  assertEquals(r.hits, []);
});

Deno.test("empty / non-string input is handled gracefully", () => {
  assertEquals(classifySensitive("").hits, []);
  // @ts-expect-error: deliberately wrong type at the boundary
  assertEquals(classifySensitive(null).hits, []);
  // @ts-expect-error: deliberately wrong type at the boundary
  assertEquals(classifySensitive(undefined).hits, []);
});

Deno.test("custom marker is used in the output", () => {
  const r = classifySensitive("I have HIV", "[הוסר]");
  assertStringIncludes(r.text, "[הוסר]");
  assertEquals(r.text.includes("[redacted]"), false);
  assertEquals(r.text.includes("HIV"), false);
});

Deno.test("case-insensitive: 'i have hiv' is detected", () => {
  const r = classifySensitive("i have hiv right now");
  assertEquals(r.hits.includes("health"), true);
});
