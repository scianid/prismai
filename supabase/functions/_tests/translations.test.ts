/**
 * Tests for supabase/functions/config/translations/index.ts
 *
 * The resolver now takes a canonical ISO 639-1 `language_code` from the
 * DB (not a free-text language name — that normalization lives upstream
 * in `supabase/functions/_shared/languageCodes.ts` and runs at write
 * time). These tests lock in the two rules the rest of the widget
 * depends on:
 *   1. Every language resolves to a *complete* table — English fills in
 *      any key the target language omits. A newly-added key in en.json
 *      must never surface as `undefined` in other languages.
 *   2. Unknown / missing / weird codes degrade to English instead of
 *      returning `null` or throwing — the widget treats the response as
 *      the source of truth, so it must always be usable.
 */
import { assertEquals, assertNotStrictEquals } from "jsr:@std/assert@1";
import {
  _bundledForTest,
  resolveTranslations,
} from "../config/translations/index.ts";

Deno.test("resolveTranslations: English returns the English bundle", () => {
  const t = resolveTranslations("en");
  assertEquals(t.topic, "Topic");
  assertEquals(t.welcomeTitle, "How can I help you?");
  assertEquals(t.welcomeSubtitle, "Ask me anything about this article");
  assertEquals(t.recommendation, "Recommandation");
  assertEquals(
    t.disclaimer,
    "This is an AI driven tool, results might not always be accurate",
  );
});

Deno.test("resolveTranslations: Hebrew returns Hebrew strings", () => {
  const t = resolveTranslations("he");
  assertEquals(t.topic, "נושא");
  assertEquals(t.welcomeTitle, "איך אוכל לעזור?");
  assertEquals(t.welcomeSubtitle, "שאל אותי כל דבר על הכתבה הזו");
  assertEquals(t.recommendation, "המלצה");
  assertEquals(
    t.disclaimer,
    "זהו כלי מונחה בינה מלאכותית, התוצאות עשויות לא להיות מדויקות תמיד",
  );
});

Deno.test("resolveTranslations: code is case-insensitive and whitespace-tolerant", () => {
  // language_code is normalized at write time, but defense-in-depth
  // keeps the resolver robust if an upstream caller passes "HE" or
  // whitespace around the code.
  assertEquals(resolveTranslations("HE").topic, "נושא");
  assertEquals(resolveTranslations("He").topic, "נושא");
  assertEquals(resolveTranslations("  he  ").topic, "נושא");
});

Deno.test("resolveTranslations: unknown code falls back to English", () => {
  assertEquals(resolveTranslations("xx").welcomeTitle, "How can I help you?");
  assertEquals(resolveTranslations("klingon").recommendation, "Recommandation");
});

Deno.test("resolveTranslations: null / undefined / empty code → English", () => {
  // NULL language_code is the documented "we don't know" value. The
  // widget must keep working for those rows, showing English strings.
  assertEquals(resolveTranslations(null).topic, "Topic");
  assertEquals(resolveTranslations(undefined).topic, "Topic");
  assertEquals(resolveTranslations("").topic, "Topic");
});

Deno.test(
  "resolveTranslations: every non-English bundle covers every English key",
  () => {
    // The whole point of the merge-over-English design is that a new key
    // shipped in en.json can never make another language return undefined
    // for that key. This test enforces that invariant at CI time — if
    // someone adds a key to en.json but not he.json, the merged result
    // still resolves to the English fallback, NOT to undefined.
    const englishKeys = Object.keys(_bundledForTest.en);
    for (const lang of Object.keys(_bundledForTest)) {
      if (lang === "en") continue;
      const merged = resolveTranslations(lang);
      for (const key of englishKeys) {
        if (typeof merged[key] !== "string" || merged[key].length === 0) {
          throw new Error(
            `Language "${lang}" resolves key "${key}" to a non-string/empty value`,
          );
        }
      }
    }
  },
);

Deno.test("resolveTranslations: returned object is a copy, not the bundle", () => {
  // Guards against a caller accidentally mutating the in-memory bundle
  // and poisoning subsequent requests (edge functions are long-lived).
  const a = resolveTranslations("en");
  const b = resolveTranslations("en");
  assertNotStrictEquals(a, b);
  a.topic = "mutated";
  assertEquals(resolveTranslations("en").topic, "Topic");
});
