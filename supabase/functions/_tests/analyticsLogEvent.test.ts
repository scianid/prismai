/**
 * Tests for `_shared/analytics.ts` (`logEvent`) — specifically the I6
 * mitigation: URLs going outbound to the secondary analytics endpoint
 * must have PII query params stripped.
 *
 * logEvent has no DI seam (it's called from chat/suggestions/etc. and
 * uses `globalThis.fetch` directly), so these tests swap in a fetch
 * stub for the duration of the test and restore it afterwards.
 */
import { assertEquals } from "jsr:@std/assert@1";
import { setEnv } from "./helpers.ts";

const restoreEnv = setEnv({
  ANALYTICS_PROXY_URL: "https://secondary.example.com/analytics",
  ANALYTICS_PROXY_API_KEY: "test-key",
});

const { logEvent } = await import("../_shared/analytics.ts");

type Capture = {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

async function withFetchStub(
  fn: (calls: Capture[]) => Promise<void> | void,
): Promise<void> {
  const calls: Capture[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const hdrs: Record<string, string> = {};
    if (init?.headers) {
      const h = new Headers(init.headers);
      for (const [k, v] of h) hdrs[k.toLowerCase()] = v;
    }
    calls.push({
      url: String(input),
      headers: hdrs,
      body: init?.body ? JSON.parse(init.body as string) : {},
    });
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

Deno.test("logEvent: scrubs PII params from article_url in body", async () => {
  await withFetchStub(async (calls) => {
    await logEvent(
      {
        projectId: "proj-1",
        articleUrl: "https://pub.example.com/article?email=foo@bar.com&q=1",
      },
      "widget_loaded",
    );
    assertEquals(calls.length, 1);
    assertEquals(
      calls[0].body.article_url,
      "https://pub.example.com/article?q=1",
    );
  });
});

Deno.test("logEvent: scrubs PII params from referer header (ctx.url)", async () => {
  await withFetchStub(async (calls) => {
    await logEvent(
      {
        projectId: "proj-1",
        url: "https://pub.example.com/page?token=secret&x=2",
      },
      "widget_loaded",
    );
    assertEquals(calls.length, 1);
    assertEquals(
      calls[0].headers["referer"],
      "https://pub.example.com/page?x=2",
    );
  });
});

Deno.test("logEvent: drops OAuth-style fragments from referer", async () => {
  await withFetchStub(async (calls) => {
    await logEvent(
      {
        projectId: "proj-1",
        url: "https://pub.example.com/cb#access_token=xyz&type=bearer",
      },
      "widget_loaded",
    );
    assertEquals(calls.length, 1);
    assertEquals(calls[0].headers["referer"], "https://pub.example.com/cb");
  });
});

Deno.test("logEvent: leaves article_url untouched when no blocked params present", async () => {
  await withFetchStub(async (calls) => {
    await logEvent(
      {
        projectId: "proj-1",
        articleUrl: "https://pub.example.com/article?utm_source=nl",
      },
      "widget_loaded",
    );
    assertEquals(
      calls[0].body.article_url,
      "https://pub.example.com/article?utm_source=nl",
    );
  });
});

Deno.test("logEvent: sends null article_url when not provided", async () => {
  await withFetchStub(async (calls) => {
    await logEvent({ projectId: "proj-1" }, "widget_loaded");
    assertEquals(calls[0].body.article_url, null);
  });
});

// Clean up env after this file's tests finish.
globalThis.addEventListener("unload", () => restoreEnv());
