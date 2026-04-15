/**
 * Tests for supabase/functions/_shared/logSafe.ts.
 *
 * SECURITY_AUDIT_TODO item 4 / SOC2 CC7.2: anonymize visitor IDs before
 * they land in application logs. These tests pin the three properties
 * incident response depends on:
 *   1. STABILITY — same (visitorId, projectId) → same tag. Incident
 *      responders recompute the tag from a known visitor and grep.
 *   2. PROJECT SCOPING — same visitorId in two projects → different tags.
 *      Limits blast radius if one project's logs leak.
 *   3. NON-REVERSIBILITY (structural) — output is 12 hex chars (48 bits)
 *      and does not contain the raw visitorId as a substring.
 *
 * We also pin the `"anon"` sentinel for null/undefined/empty visitor IDs
 * so log lines stay readable when the caller doesn't have one.
 */
import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { hashForLog } from "../_shared/logSafe.ts";

const PROJECT_A = "proj-aaa";
const PROJECT_B = "proj-bbb";
const VISITOR_1 = "visitor-0123456789";
const VISITOR_2 = "visitor-9876543210";

Deno.test("hashForLog: same inputs produce the same tag (stability)", async () => {
  const a = await hashForLog(VISITOR_1, PROJECT_A);
  const b = await hashForLog(VISITOR_1, PROJECT_A);
  assertEquals(a, b);
});

Deno.test("hashForLog: different visitors produce different tags", async () => {
  const a = await hashForLog(VISITOR_1, PROJECT_A);
  const b = await hashForLog(VISITOR_2, PROJECT_A);
  assertNotEquals(a, b);
});

Deno.test("hashForLog: same visitor in different projects produces different tags", async () => {
  // Critical: if two projects produced the same tag for the same visitor,
  // a leaked project-A log would disclose visitor activity in project B.
  const a = await hashForLog(VISITOR_1, PROJECT_A);
  const b = await hashForLog(VISITOR_1, PROJECT_B);
  assertNotEquals(a, b);
});

Deno.test("hashForLog: output is 12 hex chars", async () => {
  const tag = await hashForLog(VISITOR_1, PROJECT_A);
  assertEquals(tag.length, 12);
  assertEquals(/^[0-9a-f]{12}$/.test(tag), true);
});

Deno.test("hashForLog: output does NOT contain the raw visitor_id as substring", async () => {
  // Structural sanity check. If the helper is ever replaced by something
  // like a base64-of-the-input, this test fails loud.
  const tag = await hashForLog(VISITOR_1, PROJECT_A);
  assertEquals(tag.includes(VISITOR_1), false);
});

Deno.test("hashForLog: null/undefined/empty visitor returns 'anon'", async () => {
  assertEquals(await hashForLog(null, PROJECT_A), "anon");
  assertEquals(await hashForLog(undefined, PROJECT_A), "anon");
  assertEquals(await hashForLog("", PROJECT_A), "anon");
});
