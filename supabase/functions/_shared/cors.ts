export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'referer, sec-ch-ua-platform, sec-ch-ua-mobile, sec-ch-ua, user-agent, authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
  'Access-Control-Expose-Headers': 'X-Conversation-Id',
};

// Minimal CORS headers for cacheable responses (no Vary-inducing headers)
export const corsHeadersForCache = {
  'Access-Control-Allow-Origin': '*',
};