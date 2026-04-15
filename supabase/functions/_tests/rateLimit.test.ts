/**
 * Tests for supabase/functions/_shared/rateLimit.ts.
 *
 * SECURITY_AUDIT_TODO item 4: the rate-limiter's rejection log used to
 * embed the raw visitor_id inside the `key=` field. These tests pin the
 * new behavior: the DB key still contains the raw visitor_id (otherwise
 * rate-limit buckets would be per-hash-not-per-visitor, defeating the
 * limit), but every `console.*` line uses a hashForLog tag instead.
 *
 * Tests are structured around capturing console output and stubbing the
 * supabase client's `rpc` method, since rateLimit has no DI seam of its
 * own — it's a plain function call.
 */
import { assertEquals } from "jsr:@std/assert@1";
import { hashForLog } from "../_shared/logSafe.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";

const PROJECT_ID = "proj-ratelimit-0001";
const VISITOR_ID = "visitor-secret-0123456789";

/**
 * Build a stub supabase client whose `rpc` returns a sequence of values
 * (one per call) and records the arguments passed to each call.
 */
// deno-lint-ignore no-explicit-any
function makeSupabaseRpcStub(values: Array<number | Error>): any {
  const calls: Array<{ fn: string; params: unknown }> = [];
  let i = 0;
  return {
    calls,
    rpc: (fn: string, params: unknown) => {
      calls.push({ fn, params });
      const v = values[i++];
      if (v instanceof Error) return Promise.resolve({ data: null, error: v });
      return Promise.resolve({ data: v, error: null });
    },
  };
}

/** Capture console.warn + console.error for the duration of fn. */
async function withCapturedConsole<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; captured: string }> {
  const captured: string[] = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  // deno-lint-ignore no-explicit-any
  const cap = (...args: any[]) => {
    captured.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  console.log = cap;
  console.warn = cap;
  console.error = cap;
  try {
    const result = await fn();
    return { result, captured: captured.join("\n") };
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  }
}

Deno.test("rateLimit: DB key still embeds the raw visitorId (bucket stability)", async () => {
  // Under the limit → both checks run and return allow. We capture the
  // RPC args to prove the DB side gets the raw visitor_id — not the
  // hash. If it got the hash, two different visitors with the same hash
  // prefix (vanishingly unlikely but possible) would share a bucket, or
  // rotating the hash algorithm would invalidate all in-flight windows.
  const stub = makeSupabaseRpcStub([1, 1]); // project=1, visitor=1
  await checkRateLimit(stub, "chat", VISITOR_ID, PROJECT_ID);
  // First call is the project-level check, second is the visitor-level.
  assertEquals(stub.calls.length, 2);
  const visitorCall = stub.calls[1].params as { p_key: string };
  assertEquals(
    visitorCall.p_key.endsWith(`:visitor:${VISITOR_ID}`),
    true,
    `expected DB key to end with raw visitor id, got ${visitorCall.p_key}`,
  );
});

Deno.test("rateLimit: rejection log uses hashForLog, not the raw visitor_id", async () => {
  // Visitor check returns 9999 — way over the 20 req/min chat visitor
  // limit → handler logs a warn and returns {limited: true}.
  const stub = makeSupabaseRpcStub([1, 9999]);
  const { result, captured } = await withCapturedConsole(async () => {
    return await checkRateLimit(stub, "chat", VISITOR_ID, PROJECT_ID);
  });
  assertEquals(result.limited, true);
  // Raw visitor_id MUST NOT appear anywhere in the captured output.
  assertEquals(
    captured.includes(VISITOR_ID),
    false,
    `raw visitor_id leaked into log output:\n${captured}`,
  );
  // The hashForLog tag SHOULD appear (marker that the log site fired).
  const expectedTag = await hashForLog(VISITOR_ID, PROJECT_ID);
  assertEquals(
    captured.includes(expectedTag),
    true,
    `expected hashed tag ${expectedTag} in log output:\n${captured}`,
  );
});

Deno.test("rateLimit: DB error log uses the hashed key", async () => {
  // Force an error on the visitor check and assert the error log line
  // doesn't contain the raw visitor_id either.
  const stub = makeSupabaseRpcStub([1, new Error("db down")]);
  const { captured } = await withCapturedConsole(async () => {
    return await checkRateLimit(stub, "chat", VISITOR_ID, PROJECT_ID);
  });
  assertEquals(
    captured.includes(VISITOR_ID),
    false,
    `raw visitor_id leaked into DB error log:\n${captured}`,
  );
});

Deno.test("rateLimit: project-only check (no visitor) still logs without PII concerns", async () => {
  const stub = makeSupabaseRpcStub([99999]); // project limit blown
  const { result, captured } = await withCapturedConsole(async () => {
    return await checkRateLimit(stub, "config", null, PROJECT_ID);
  });
  assertEquals(result.limited, true);
  // Log should include the projectId (not PII) and the "config:project:" prefix.
  assertEquals(captured.includes(`config:project:${PROJECT_ID}`), true);
});
