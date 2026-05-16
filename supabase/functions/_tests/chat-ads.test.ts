/**
 * Tests for supabase/functions/chat-ads/index.ts
 *
 * Exercises the dependency-injection seam (`adsHandler(req, deps)`) plus the
 * pure helpers (`normalizeAds`, `validIabCodes`).
 *
 * Covered behaviors (priority: security & cost-safety first):
 *   - 200 {ads:[]} when projectId is not in the hardcoded allowlist
 *   - 403 when the request origin is not in project.allowed_urls
 *   - 429 when rate-limited (Retry-After header)
 *   - 400 on missing url
 *   - Hallucinated IAB codes are dropped before reaching Teads
 *   - Raw user message text is NEVER forwarded to Teads (PII) — only keywords
 *   - Paid inventory (docs with pixels) is preferred over organic
 *   - The whole Teads batch is returned (no server-side cap)
 *   - Teads 500 → 502; non-JSON → 502
 *   - Classification is cached per conversationId (LLM runs once)
 *   - normalizeAds maps the Teads schema + strips 3rd-party HTML
 *   - validIabCodes keeps only well-formed codes
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { postJson, setEnv } from "./helpers.ts";

// ── One-time env setup (before importing the handler module) ──────────────
const _restoreEnv = setEnv({
  TEADS_WIDGET_JS_ID: "APP_TEST",
  TEADS_API_KEY: "teads-test-key",
});

// Neutralize the module-level `Deno.serve(...)` so the dynamic import below
// doesn't bind a port. We test `adsHandler` directly via the exported seam.
// @ts-ignore: Deno globals are unavailable to the editor TS server
Deno.serve = ((_fn: unknown) => ({} as unknown)) as typeof Deno.serve;

const mod = await import("../chat-ads/index.ts") as {
  // deno-lint-ignore no-explicit-any
  adsHandler: (req: Request, deps: any) => Promise<Response>;
  // deno-lint-ignore no-explicit-any
  normalizeAds: (raw: unknown) => any[];
  validIabCodes: (input: unknown) => string[];
};
const { adsHandler, normalizeAds, validIabCodes } = mod;

// ── Fixtures ──────────────────────────────────────────────────────────────

// Must match an entry in chat-ads' hardcoded ENABLED_PROJECT_IDS.
const PROJECT_ID = "26853c64-1104-4525-b62c-66367d925b12";
const ALLOWED_HOST = "publisher.example.com";
const ALLOWED_ORIGIN = "https://publisher.example.com";
const ARTICLE_URL = "https://publisher.example.com/articles/foo";

function paidDoc(overrides: Record<string, unknown> = {}) {
  return {
    pos: "0",
    adType: "Unknown",
    url: "https://paid.outbrain.com/redir?p=1",
    thumbnail_url: "https://img.example/1.jpg",
    source_display_name: "Tips and Tricks",
    content: "A sponsored headline",
    description: "A sponsored description",
    target_domain: "tips.example",
    cta: "Read More",
    doc_tracking: {
      pixels: ["https://px.example/imp1"],
      "on-viewed": ["https://px.example/view1"],
    },
    ...overrides,
  };
}

function organicDoc(overrides: Record<string, unknown> = {}) {
  // Organic recommendation — no pixels, no cta.
  return {
    pos: "0",
    url: "https://obnews.outbrain.com/redir?p=9",
    content: "An organic headline",
    doc_tracking: { pixels: [], "on-viewed": ["https://px.example/orgview"] },
    ...overrides,
  };
}

function teadsResponse(documents: unknown[], status = 200): Response {
  return new Response(
    JSON.stringify({ version: "2.0", results: { embeddings: { documents } } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

/** fetchTeads stub that records each call's URL + parsed body. */
function spyTeads(documents: unknown[] = [paidDoc()]) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fn = (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    return Promise.resolve(teadsResponse(documents));
  };
  return { fn, calls };
}

/**
 * Build an AdsDeps stub. Defaults are the happy path; tests override the
 * bits they assert on.
 */
// deno-lint-ignore no-explicit-any
function makeDeps(overrides: Record<string, unknown> = {}): any {
  return {
    supabaseClient: () => ({}),
    getProjectById: () => Promise.resolve({ project_id: PROJECT_ID, allowed_urls: [ALLOWED_HOST] }),
    checkRateLimit: () => Promise.resolve({ limited: false }),
    classifyAdContext: () =>
      Promise.resolve({
        iabCategories: ["IAB19"],
        keywords: ["web analytics", "time on site"],
        tokenUsage: null,
        model: "test-model",
      }),
    fetchTeads: () => Promise.resolve(teadsResponse([paidDoc()])),
    ...overrides,
  };
}

function adsBody(overrides: Record<string, unknown> = {}) {
  return {
    projectId: PROJECT_ID,
    url: ARTICLE_URL,
    title: "How AI assistants raise time-on-site",
    lang: "en",
    visitor_id: "visitor-test",
    messages: [
      { role: "user", content: "Which site saw 45% more time?" },
    ],
    ...overrides,
  };
}

// ── Allowlist gate ────────────────────────────────────────────────────────

Deno.test("chat-ads: projectId not in allowlist returns 200 with empty ads", async () => {
  let teadsCalled = false;
  const deps = makeDeps({
    fetchTeads: () => {
      teadsCalled = true;
      return Promise.resolve(teadsResponse([]));
    },
  });
  const res = await adsHandler(
    postJson("chat-ads", adsBody({ projectId: "not-enabled" }), ALLOWED_ORIGIN),
    deps,
  );
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.ads, []);
  assertEquals(json.reason, "project_not_enabled");
  assertEquals(teadsCalled, false);
});

// ── Origin enforcement ────────────────────────────────────────────────────

Deno.test("chat-ads: origin not in allowed_urls returns 403", async () => {
  const deps = makeDeps({
    getProjectById: () =>
      Promise.resolve({ project_id: PROJECT_ID, allowed_urls: ["other.example.com"] }),
  });
  const res = await adsHandler(
    postJson("chat-ads", adsBody(), ALLOWED_ORIGIN),
    deps,
  );
  assertEquals(res.status, 403);
});

Deno.test("chat-ads: missing project (lookup fails) returns 403", async () => {
  const deps = makeDeps({
    getProjectById: () => Promise.reject(new Error("not found")),
  });
  const res = await adsHandler(
    postJson("chat-ads", adsBody(), ALLOWED_ORIGIN),
    deps,
  );
  assertEquals(res.status, 403);
});

// ── Rate limiting ─────────────────────────────────────────────────────────

Deno.test("chat-ads: rate-limited request returns 429 with Retry-After", async () => {
  let teadsCalled = false;
  const deps = makeDeps({
    checkRateLimit: () => Promise.resolve({ limited: true, retryAfterSeconds: 30 }),
    fetchTeads: () => {
      teadsCalled = true;
      return Promise.resolve(teadsResponse([]));
    },
  });
  const res = await adsHandler(
    postJson("chat-ads", adsBody(), ALLOWED_ORIGIN),
    deps,
  );
  assertEquals(res.status, 429);
  assertEquals(res.headers.get("Retry-After"), "30");
  assertEquals(teadsCalled, false);
});

// ── Input validation ──────────────────────────────────────────────────────

Deno.test("chat-ads: missing url returns 400", async () => {
  const res = await adsHandler(
    postJson("chat-ads", adsBody({ url: "" }), ALLOWED_ORIGIN),
    makeDeps(),
  );
  assertEquals(res.status, 400);
});

// ── IAB validation (security: guard Teads against hallucinated input) ─────

Deno.test("chat-ads: hallucinated IAB codes are dropped before reaching Teads", async () => {
  const spy = spyTeads();
  const deps = makeDeps({
    classifyAdContext: () =>
      Promise.resolve({
        iabCategories: ["IAB19", "garbage", "iab-bad", "IAB1-2"],
        keywords: ["analytics"],
        tokenUsage: null,
        model: "m",
      }),
    fetchTeads: spy.fn,
  });
  const res = await adsHandler(
    postJson("chat-ads", adsBody(), ALLOWED_ORIGIN),
    deps,
  );
  assertEquals(res.status, 200);
  assertEquals(spy.calls[0].body.iabCategories, ["IAB19", "IAB1-2"]);
});

// ── Privacy: raw user text must never reach Outbrain ──────────────────────

Deno.test("chat-ads: raw user messages are NOT forwarded to Teads as chat text", async () => {
  const spy = spyTeads();
  const deps = makeDeps({ fetchTeads: spy.fn });
  const secret = "my email is secret-user@example.com and my SSN is 123-45-6789";
  await adsHandler(
    postJson(
      "chat-ads",
      adsBody({ messages: [{ role: "user", content: secret }] }),
      ALLOWED_ORIGIN,
    ),
    deps,
  );
  const sentChat = String(spy.calls[0].body.chat ?? "");
  assert(!sentChat.includes("secret-user@example.com"), "email leaked to Teads");
  assert(!sentChat.includes("123-45-6789"), "SSN leaked to Teads");
  // chat is the derived keywords instead.
  assertEquals(sentChat, "web analytics time on site");
});

// ── Paid-inventory preference ─────────────────────────────────────────────

Deno.test("chat-ads: prefers paid inventory (docs with pixels) over organic", async () => {
  const deps = makeDeps({
    fetchTeads: () =>
      Promise.resolve(teadsResponse([
        organicDoc({ url: "https://obnews.outbrain.com/a" }),
        paidDoc({ url: "https://paid.outbrain.com/b" }),
        organicDoc({ url: "https://obnews.outbrain.com/c" }),
      ])),
  });
  const res = await adsHandler(
    postJson("chat-ads", adsBody(), ALLOWED_ORIGIN),
    deps,
  );
  const json = await res.json();
  assertEquals(json.ads.length, 1);
  assertEquals(json.ads[0].url, "https://paid.outbrain.com/b");
});

Deno.test("chat-ads: returns the whole Teads batch (no server-side cap)", async () => {
  const docs = Array.from(
    { length: 6 },
    (_, i) => paidDoc({ url: `https://paid.outbrain.com/${i}` }),
  );
  const deps = makeDeps({ fetchTeads: () => Promise.resolve(teadsResponse(docs)) });
  const res = await adsHandler(
    postJson("chat-ads", adsBody(), ALLOWED_ORIGIN),
    deps,
  );
  const json = await res.json();
  assertEquals(json.ads.length, 6);
});

// ── Upstream failure handling ─────────────────────────────────────────────

Deno.test("chat-ads: Teads 500 returns 502", async () => {
  const deps = makeDeps({
    fetchTeads: () => Promise.resolve(teadsResponse([], 500)),
  });
  const res = await adsHandler(
    postJson("chat-ads", adsBody(), ALLOWED_ORIGIN),
    deps,
  );
  assertEquals(res.status, 502);
  await res.body?.cancel();
});

Deno.test("chat-ads: Teads non-JSON returns 502", async () => {
  const deps = makeDeps({
    fetchTeads: () => Promise.resolve(new Response("<html>nope</html>", { status: 200 })),
  });
  const res = await adsHandler(
    postJson("chat-ads", adsBody(), ALLOWED_ORIGIN),
    deps,
  );
  assertEquals(res.status, 502);
  await res.body?.cancel();
});

// ── Classification caching ────────────────────────────────────────────────

Deno.test("chat-ads: classification is cached per conversationId", async () => {
  let classifyCalls = 0;
  const deps = makeDeps({
    classifyAdContext: () => {
      classifyCalls++;
      return Promise.resolve({
        iabCategories: ["IAB19"],
        keywords: ["analytics"],
        tokenUsage: null,
        model: "m",
      });
    },
  });
  const convId = `conv-cache-${crypto.randomUUID()}`;
  for (let i = 0; i < 3; i++) {
    const res = await adsHandler(
      postJson("chat-ads", adsBody({ conversationId: convId }), ALLOWED_ORIGIN),
      deps,
    );
    await res.body?.cancel();
  }
  assertEquals(classifyCalls, 1);
});

Deno.test("chat-ads: explicit keywords/iabCategories skip the classifier", async () => {
  let classifyCalls = 0;
  const spy = spyTeads();
  const deps = makeDeps({
    classifyAdContext: () => {
      classifyCalls++;
      return Promise.resolve({ iabCategories: [], keywords: [], tokenUsage: null, model: "m" });
    },
    fetchTeads: spy.fn,
  });
  await adsHandler(
    postJson(
      "chat-ads",
      adsBody({ iabCategories: ["IAB1"], keywords: ["running shoes"] }),
      ALLOWED_ORIGIN,
    ),
    deps,
  );
  assertEquals(classifyCalls, 0);
  assertEquals(spy.calls[0].body.iabCategories, ["IAB1"]);
  assertEquals(spy.calls[0].body.keywords, ["running shoes"]);
});

// ── Pure helpers ──────────────────────────────────────────────────────────

Deno.test("normalizeAds: maps the Teads document schema", () => {
  const ads = normalizeAds({
    results: { embeddings: { documents: [paidDoc()] } },
  });
  assertEquals(ads.length, 1);
  assertEquals(ads[0].position, 0);
  assertEquals(ads[0].headline, "A sponsored headline");
  assertEquals(ads[0].description, "A sponsored description");
  assertEquals(ads[0].thumbnail, "https://img.example/1.jpg");
  assertEquals(ads[0].source, "Tips and Tricks");
  assertEquals(ads[0].domain, "tips.example");
  assertEquals(ads[0].cta, "Read More");
  assertEquals(ads[0].trackers.pixels, ["https://px.example/imp1"]);
  assertEquals(ads[0].trackers.onViewed, ["https://px.example/view1"]);
});

Deno.test("normalizeAds: strips third-party HTML from text fields (XSS-safe)", () => {
  const ads = normalizeAds({
    results: {
      embeddings: {
        documents: [paidDoc({
          source_display_name: '<span class="ob-us">US</span>',
          content: "Headline &amp; more",
        })],
      },
    },
  });
  assertEquals(ads[0].source, "US");
  assertEquals(ads[0].headline, "Headline & more");
});

Deno.test("normalizeAds: tolerates missing results / fields", () => {
  assertEquals(normalizeAds(null), []);
  assertEquals(normalizeAds({}), []);
  assertEquals(normalizeAds({ results: {} }), []);
  const ads = normalizeAds({ results: { embeddings: { documents: [{}] } } });
  assertEquals(ads.length, 1);
  assertEquals(ads[0].headline, null);
  assertEquals(ads[0].trackers.pixels, []);
});

Deno.test("validIabCodes: keeps only well-formed IAB codes", () => {
  assertEquals(
    validIabCodes(["IAB1", "IAB19", "IAB1-2", "garbage", "iab-bad", "", 42, null]),
    ["IAB1", "IAB19", "IAB1-2"],
  );
  assertEquals(validIabCodes("not-an-array"), []);
  assertEquals(validIabCodes(undefined), []);
});
