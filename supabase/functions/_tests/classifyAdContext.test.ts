/**
 * Tests for classifyAdContext() in supabase/functions/_shared/ai.ts
 *
 * classifyAdContext calls the OpenAI chat-completions endpoint directly, so
 * these tests stub `globalThis.fetch`.
 *
 * Covered behaviors:
 *   - Parses iabCategories + keywords from the model's JSON response
 *   - Includes the article title in the prompt as topical context
 *   - Caps iabCategories at 4 and keywords at 8
 *   - Non-string entries in the model output are dropped
 *   - Throws on a non-OK upstream response
 */
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { setEnv } from "./helpers.ts";

const _restoreEnv = setEnv();

const { classifyAdContext } = await import("../_shared/ai.ts") as {
  classifyAdContext: (
    messages: { role: string; content: string }[],
    language: string,
    articleTitle?: string | null,
  ) => Promise<{ iabCategories: string[]; keywords: string[] }>;
};

function openaiResponse(content: string, status = 200): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

/** Runs `fn` with globalThis.fetch stubbed; always restores it. */
async function withFetch(
  stub: typeof fetch,
  fn: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
}

Deno.test("classifyAdContext: parses iabCategories + keywords from the model", async () => {
  // deno-lint-ignore no-explicit-any
  let sentBody: any;
  const stub = ((_url: unknown, init?: RequestInit) => {
    sentBody = JSON.parse(String(init?.body));
    return Promise.resolve(
      openaiResponse(JSON.stringify({
        iabCategories: ["IAB19"],
        keywords: ["gaming laptop", "gpu"],
      })),
    );
  }) as typeof fetch;

  await withFetch(stub, async () => {
    const r = await classifyAdContext(
      [{ role: "user", content: "best gaming laptop?" }],
      "en",
      "Ultimate gaming gear guide",
    );
    assertEquals(r.iabCategories, ["IAB19"]);
    assertEquals(r.keywords, ["gaming laptop", "gpu"]);

    // The article title is woven into the prompt as topical context.
    // deno-lint-ignore no-explicit-any
    const userMsg = sentBody.messages.find((m: any) => m.role === "user").content;
    assert(
      userMsg.includes("Ultimate gaming gear guide"),
      "article title should be in the prompt",
    );
  });
});

Deno.test("classifyAdContext: caps iabCategories at 4 and keywords at 8", async () => {
  const stub = (() =>
    Promise.resolve(
      openaiResponse(JSON.stringify({
        iabCategories: ["IAB1", "IAB2", "IAB3", "IAB4", "IAB5", "IAB6"],
        keywords: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
      })),
    )) as typeof fetch;

  await withFetch(stub, async () => {
    const r = await classifyAdContext(
      [{ role: "user", content: "anything" }],
      "en",
    );
    assertEquals(r.iabCategories.length, 4);
    assertEquals(r.keywords.length, 8);
  });
});

Deno.test("classifyAdContext: drops non-string entries from the model output", async () => {
  const stub = (() =>
    Promise.resolve(
      openaiResponse(JSON.stringify({
        iabCategories: ["IAB1", 42, null, "IAB2"],
        keywords: ["shoes", { x: 1 }, "boots"],
      })),
    )) as typeof fetch;

  await withFetch(stub, async () => {
    const r = await classifyAdContext([{ role: "user", content: "x" }], "en");
    assertEquals(r.iabCategories, ["IAB1", "IAB2"]);
    assertEquals(r.keywords, ["shoes", "boots"]);
  });
});

Deno.test("classifyAdContext: throws on a non-OK upstream response", async () => {
  const stub = (() => Promise.resolve(openaiResponse("{}", 500))) as typeof fetch;

  await withFetch(stub, async () => {
    await assertRejects(
      () => classifyAdContext([{ role: "user", content: "x" }], "en"),
    );
  });
});
