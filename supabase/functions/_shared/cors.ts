export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // H-3 fix: removed 'authorization' (widget never sends bearer tokens — AI calls are server-side)
  // and added 'x-visitor-token' (required for conversations auth added in C-2 fix).
  'Access-Control-Allow-Headers': 'referer, sec-ch-ua-platform, sec-ch-ua-mobile, sec-ch-ua, user-agent, x-client-info, apikey, content-type, x-visitor-token',
  // H-3 fix: removed 'PUT' — no endpoint uses PUT cross-origin; DELETE is kept for conversation deletion.
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE',
  'Access-Control-Expose-Headers': 'X-Conversation-Id, X-Visitor-Token',
};

// Minimal CORS headers for cacheable responses (no Vary-inducing headers)
export const corsHeadersForCache = {
  'Access-Control-Allow-Origin': '*',
};