// Coarse browser detection for Sentry tagging.
//
// The widget runs on third-party publisher sites and we need to separate
// environmental failures ("Safari ITP blocked the fetch") from real bugs.
// A one-word bucket is plenty for Sentry filter dropdowns — finer detail
// (version, OS) is already in the raw user_agent extra.
//
// Detection order matters: Edge/Opera/Samsung all inject `Chrome/` into
// their UA for compatibility, so they must be checked BEFORE plain Chrome.
// Similarly, Chrome on any platform includes `Safari/` for historical
// reasons, so Safari comes last among the WebKit-family siblings.

export type BrowserKind =
  | "edge"
  | "opera"
  | "samsung"
  | "firefox"
  | "chrome"
  | "safari"
  | "webview"
  | "unknown";

export function detectBrowser(userAgent: string | null | undefined): BrowserKind {
  if (!userAgent) return "unknown";
  const ua = userAgent;

  // Chromium derivatives that masquerade as Chrome — check first.
  if (/\bEdg(A|iOS)?\//i.test(ua) || /\bEdge\//i.test(ua)) return "edge";
  if (/\bOPR\//i.test(ua) || /\bOpera\//i.test(ua)) return "opera";
  if (/\bSamsungBrowser\//i.test(ua)) return "samsung";

  // Firefox family (incl. iOS FxiOS, which is actually WebKit under the hood
  // but users experience it as Firefox — treat as firefox).
  if (/\b(Firefox|FxiOS)\//i.test(ua)) return "firefox";

  // Embedded webviews — iOS WKWebView and Android WebView both hit divee.ai
  // sometimes (app embeds of articles). Distinct bucket because they have
  // their own quirks (no cookies, restricted storage, etc).
  // Android WebView: "; wv)" marker. iOS: Safari-like UA with no "Safari/"
  // token (standalone WebViews omit it) or "AppleWebKit/" without browser
  // identifier.
  if (/;\s*wv\)/i.test(ua)) return "webview";

  // Chrome (desktop/Android) and Chrome-on-iOS (CriOS, which is actually
  // WebKit but branded as Chrome — tag as chrome so it matches user
  // expectation; CriOS users still hit Safari ITP just like Safari users,
  // but that shows up in other dimensions).
  if (/\b(Chrome|CriOS|Chromium)\//i.test(ua)) return "chrome";

  // Apple Safari — Mac, iOS. Must be last among WebKit families since
  // Chrome's UA also contains "Safari/".
  if (/\bSafari\//i.test(ua) && /\bAppleWebKit\//i.test(ua)) return "safari";

  return "unknown";
}
