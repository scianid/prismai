/**
 * Tests for supabase/functions/_shared/userAgent.ts.
 *
 * Detection order is the load-bearing property here — Edge/Opera/Samsung
 * all embed "Chrome/" for compatibility, and every WebKit-based browser
 * embeds "Safari/" — so getting the precedence wrong silently mis-buckets
 * Sentry events. These fixtures lock the expected bucket for real UA
 * strings pulled from production Sentry traffic and browser docs.
 */
import { assertEquals } from "jsr:@std/assert@1";
import { detectBrowser } from "../_shared/userAgent.ts";

Deno.test("Chrome desktop → chrome", () => {
  assertEquals(
    detectBrowser(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ),
    "chrome",
  );
});

Deno.test("Chrome on Android → chrome", () => {
  assertEquals(
    detectBrowser(
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    ),
    "chrome",
  );
});

Deno.test("Chrome on iOS (CriOS) → chrome", () => {
  assertEquals(
    detectBrowser(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1",
    ),
    "chrome",
  );
});

Deno.test("Safari on macOS → safari", () => {
  assertEquals(
    detectBrowser(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    ),
    "safari",
  );
});

Deno.test("Safari on iOS → safari", () => {
  assertEquals(
    detectBrowser(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    ),
    "safari",
  );
});

Deno.test("Firefox desktop → firefox", () => {
  assertEquals(
    detectBrowser(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
    ),
    "firefox",
  );
});

Deno.test("Firefox on iOS (FxiOS) → firefox", () => {
  assertEquals(
    detectBrowser(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120.0 Mobile/15E148 Safari/605.1.15",
    ),
    "firefox",
  );
});

Deno.test("Edge (Chromium, Edg/) → edge, not chrome", () => {
  // Edge UA embeds both Chrome/ and Safari/. Must resolve to edge.
  assertEquals(
    detectBrowser(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    ),
    "edge",
  );
});

Deno.test("Opera (OPR/) → opera, not chrome", () => {
  assertEquals(
    detectBrowser(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0",
    ),
    "opera",
  );
});

Deno.test("Samsung Internet → samsung, not chrome", () => {
  assertEquals(
    detectBrowser(
      "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
    ),
    "samsung",
  );
});

Deno.test("Android WebView (wv marker) → webview", () => {
  assertEquals(
    detectBrowser(
      "Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36",
    ),
    "webview",
  );
});

Deno.test("empty / null / undefined → unknown", () => {
  assertEquals(detectBrowser(null), "unknown");
  assertEquals(detectBrowser(undefined), "unknown");
  assertEquals(detectBrowser(""), "unknown");
});

Deno.test("nonsense UA → unknown", () => {
  assertEquals(detectBrowser("definitely-not-a-real-user-agent"), "unknown");
});

Deno.test("curl UA → unknown (no browser markers)", () => {
  assertEquals(detectBrowser("curl/8.4.0"), "unknown");
});
