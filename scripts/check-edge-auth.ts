#!/usr/bin/env -S deno run --allow-read=. --allow-env
// Auth-bypass guard for divee-widget Supabase Edge Functions.
//
// Every widget edge function has `verify_jwt = false` in supabase/config.toml,
// because the widget is a public API called by end users with no Supabase
// account. That means each handler must enforce auth itself — either through
// origin gating (CORS allowlist) or HMAC visitor tokens. A function that
// forgets to do this is silently exposed to the open internet.
//
// This script enforces that every function entrypoint either:
//   1. imports one of the configured "auth helpers" (origin gate or visitor
//      token verifier), OR
//   2. is on the explicit PUBLIC_ALLOWLIST below with a documented reason.
//
// Run from repo root:  deno run --allow-read=. scripts/check-edge-auth.ts
// Or via task:         (cd supabase/functions && deno task guard:auth)

const REPO_ROOT = new URL("../", import.meta.url).pathname;
const FUNCTIONS_DIR = `${REPO_ROOT}supabase/functions`;
const CONFIG_TOML = `${REPO_ROOT}supabase/config.toml`;

interface AuthHelper {
  /** Human-readable name for error messages. */
  name: string;
  /** Regex matching an `import { ..., <name>, ... } from "..._shared/<module>"` statement. */
  pattern: RegExp;
}

/** A function passes if it imports any one of these. */
const AUTH_HELPERS: AuthHelper[] = [
  {
    name: "isAllowedOrigin (from _shared/origin.ts)",
    pattern:
      /import\s*\{[^}]*\bisAllowedOrigin\b[^}]*\}\s*from\s*["'][^"']*_shared\/origin(\.ts)?["']/,
  },
];

// Functions that are intentionally callable without an origin gate.
// Each entry MUST document how the function authorizes its caller instead.
// Adding an entry here is a security decision — require a second reviewer.
const PUBLIC_ALLOWLIST: Record<string, string> = {
  // widget-error is a write-only error-reporting proxy to Sentry. It reads
  // no project data, returns no body, caps payloads at 8KB, and Sentry
  // itself rate-limits inbound events. Gating by origin would require a DB
  // lookup per report and would silently drop errors from mis-configured
  // projects — the opposite of what an error-reporting endpoint should do.
  "widget-error":
    "Write-only Sentry proxy; no DB access, no response data, 8KB body cap, Sentry rate-limits inbound events.",
};

interface Failure {
  fn: string;
  reason: string;
}

async function listFunctionDirs(): Promise<string[]> {
  const out: string[] = [];
  for await (const entry of Deno.readDir(FUNCTIONS_DIR)) {
    if (!entry.isDirectory) continue;
    if (entry.name.startsWith("_")) continue; // _shared, _tests, etc.
    out.push(entry.name);
  }
  return out.sort();
}

async function readIndex(fn: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(`${FUNCTIONS_DIR}/${fn}/index.ts`);
  } catch {
    return null;
  }
}

function matchAnyHelper(src: string): AuthHelper | null {
  for (const h of AUTH_HELPERS) {
    if (h.pattern.test(src)) return h;
  }
  return null;
}

async function readVerifyJwtMap(): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  let toml: string;
  try {
    toml = await Deno.readTextFile(CONFIG_TOML);
  } catch {
    return map; // no config.toml — treat all as default (verify_jwt = true)
  }
  // Tiny parser: looks for `[functions.<name>]` headers and the next
  // `verify_jwt = true|false` within that block.
  const lines = toml.split("\n");
  let current: string | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    const header = line.match(/^\[functions\.([^\]]+)\]$/);
    if (header) {
      current = header[1];
      continue;
    }
    if (line.startsWith("[")) {
      current = null;
      continue;
    }
    if (current) {
      const m = line.match(/^verify_jwt\s*=\s*(true|false)\s*$/);
      if (m) map.set(current, m[1] === "true");
    }
  }
  return map;
}

async function main() {
  const functions = await listFunctionDirs();
  const verifyJwtMap = await readVerifyJwtMap();
  const failures: Failure[] = [];
  const stalePublicAllowlist = new Set(Object.keys(PUBLIC_ALLOWLIST));

  for (const fn of functions) {
    stalePublicAllowlist.delete(fn);

    const src = await readIndex(fn);
    if (src === null) {
      failures.push({ fn, reason: "missing index.ts" });
      continue;
    }

    // verify_jwt defaults to true if not explicitly set in config.toml.
    const gatewayVerifies = verifyJwtMap.get(fn) ?? true;

    // If the gateway verifies the JWT, we trust that and move on.
    if (gatewayVerifies) continue;

    // Gateway is OFF. Must either use an auth helper or be allowlisted.
    const matchedHelper = matchAnyHelper(src);
    const allowlisted = fn in PUBLIC_ALLOWLIST;

    if (!matchedHelper && !allowlisted) {
      failures.push({
        fn,
        reason:
          "config.toml sets verify_jwt = false, but index.ts imports none of the configured auth helpers and is not on PUBLIC_ALLOWLIST.",
      });
    }

    if (matchedHelper && allowlisted) {
      failures.push({
        fn,
        reason:
          `Function uses ${matchedHelper.name} AND is on PUBLIC_ALLOWLIST. Pick one — remove the allowlist entry.`,
      });
    }
  }

  // Allowlist entries that no longer correspond to a real function are stale
  // and must be removed so the list doesn't rot.
  for (const stale of stalePublicAllowlist) {
    failures.push({
      fn: stale,
      reason: "PUBLIC_ALLOWLIST entry has no matching function directory.",
    });
  }

  if (failures.length === 0) {
    console.log(
      `✓ Edge auth guard: ${functions.length} functions checked, all good.`,
    );
    Deno.exit(0);
  }

  console.error(
    `✗ Edge auth guard: ${failures.length} problem(s) in ${functions.length} functions:\n`,
  );
  for (const { fn, reason } of failures) {
    console.error(`  - ${fn}: ${reason}`);
  }
  const helperList = AUTH_HELPERS.map((h) => `       • ${h.name}`).join("\n");
  console.error(
    "\nFix by either:\n" +
      `  1. Importing one of the accepted auth helpers:\n${helperList}\n` +
      "  2. Adding the function to PUBLIC_ALLOWLIST in this script with a one-line reason explaining how it authorizes callers.\n",
  );
  Deno.exit(1);
}

if (import.meta.main) {
  await main();
}

// Marks the file as an ES module so the IDE TypeScript service stops
// complaining about top-level await (Deno allows it unconditionally).
export {};
