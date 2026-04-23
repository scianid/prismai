export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // H-3 fix: removed 'authorization' (widget never sends bearer tokens - AI calls are server-side).
  "Access-Control-Allow-Headers":
    "referer, sec-ch-ua-platform, sec-ch-ua-mobile, sec-ch-ua, user-agent, x-client-info, apikey, content-type",
  // H-3 fix: removed 'PUT' - no endpoint uses PUT cross-origin.
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
  "Access-Control-Expose-Headers": "X-Conversation-Id",
};

// Minimal CORS headers for cacheable responses (no Vary-inducing headers)
export const corsHeadersForCache = {
  "Access-Control-Allow-Origin": "*",
};
