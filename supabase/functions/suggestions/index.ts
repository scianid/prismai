import "jsr:@supabase/functions-js@2/edge-runtime.d.ts";
import { getRequestOriginUrl, isAllowedOriginStrict } from "../_shared/origin.ts";
import { generateSuggestions } from "../_shared/ai.ts";
import { logEvent } from "../_shared/analytics.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  enforceContentLength,
  errorResp,
  notFoundRespWithShortCache,
  successResp,
  successRespWithCache,
} from "../_shared/responses.ts";
import { getProjectById } from "../_shared/dao/projectDao.ts";
import {
  extractCachedSuggestions,
  getArticleById,
  insertArticle,
  updateArticleCache,
} from "../_shared/dao/articleDao.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { MAX_CONTENT_LENGTH, MAX_TITLE_LENGTH, sanitizeContent } from "../_shared/constants.ts";
import { insertTokenUsage } from "../_shared/dao/tokenUsageDao.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { generateEmbedding } from "../_shared/embeddingService.ts";
import { searchSimilarChunks } from "../_shared/dao/ragDocumentDao.ts";
import { captureException, serveWithSentry } from "../_shared/sentry.ts";

// ─── Dependency injection seam ────────────────────────────────────────────
// `suggestionsHandler` accepts a `SuggestionsDeps` object so unit tests can
// stub external services (Supabase DAOs, AI, rate-limit, embeddings) without
// touching the network. Production wires the real implementations via
// `realSuggestionsDeps`. Same pattern as chat/config/articles.
export interface SuggestionsDeps {
  supabaseClient: typeof supabaseClient;
  getProjectById: typeof getProjectById;
  getArticleById: typeof getArticleById;
  insertArticle: typeof insertArticle;
  extractCachedSuggestions: typeof extractCachedSuggestions;
  updateArticleCache: typeof updateArticleCache;
  generateSuggestions: typeof generateSuggestions;
  logEvent: typeof logEvent;
  checkRateLimit: typeof checkRateLimit;
  generateEmbedding: typeof generateEmbedding;
  searchSimilarChunks: typeof searchSimilarChunks;
  insertTokenUsage: typeof insertTokenUsage;
}

export const realSuggestionsDeps: SuggestionsDeps = {
  supabaseClient,
  getProjectById,
  getArticleById,
  insertArticle,
  extractCachedSuggestions,
  updateArticleCache,
  generateSuggestions,
  logEvent,
  checkRateLimit,
  generateEmbedding,
  searchSimilarChunks,
  insertTokenUsage,
};

export async function suggestionsHandler(
  req: Request,
  deps: SuggestionsDeps = realSuggestionsDeps,
): Promise<Response> {
  console.log("suggestions: request received", {
    method: req.method,
    url: req.url,
    origin: req.headers.get("origin"),
    referer: req.headers.get("referer"),
    host: req.headers.get("host"),
    userAgent: req.headers.get("user-agent"),
    contentType: req.headers.get("content-type"),
    contentLength: req.headers.get("content-length"),
    hasApiKey: !!req.headers.get("apikey"),
    hasAuth: !!req.headers.get("authorization"),
    headerKeys: [...req.headers.keys()],
  });

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    console.log("suggestions: CORS preflight", {
      acrMethod: req.headers.get("access-control-request-method"),
      acrHeaders: req.headers.get("access-control-request-headers"),
    });
    return new Response("ok", { headers: corsHeaders });
  }

  // GET = CDN-cacheable cache-hit lookup. Keyed by (projectId, url) in the
  // query string, lenient origin (CDN cache-warming + CDN-stripped Origin),
  // returns cached suggestions on hit or short-TTL 404 on miss. The widget
  // tries this first; on null/404 it falls back to the existing POST that
  // ingests the article and generates suggestions via AI.
  if (req.method === "GET") {
    return await handleGetSuggestions(req, deps);
  }

  // SECURITY_AUDIT_TODO item 3: cap body size BEFORE parsing. Same 64KB
  // budget as /chat — same MAX_CONTENT_LENGTH + MAX_TITLE_LENGTH sanitizer
  // caps apply here.
  const oversize = enforceContentLength(req, 262144);
  if (oversize) return oversize;

  try {
    let { projectId, title, content, url, visitor_id, session_id, metadata } = await req.json();

    console.log("suggestions: body parsed", {
      projectId,
      url,
      titleLen: title?.length,
      contentLen: content?.length,
      visitor_id,
      session_id,
      hasMetadata: !!metadata,
    });

    // Truncate then sanitize inputs - mitigates stored prompt injection (C-1)
    if (title) title = sanitizeContent(title.substring(0, MAX_TITLE_LENGTH));
    if (content) {
      content = sanitizeContent(content.substring(0, MAX_CONTENT_LENGTH));
    }

    if (!projectId) {
      console.error(
        `suggestions: missing projectId in request, url: ${req.url}`,
      );
      return errorResp("suggestions: missing projectId", 400, {
        suggestions: [],
      });
    }

    // Initialize Supabase client with service role key (bypasses RLS)
    const supabase = await deps.supabaseClient();

    const project = await deps.getProjectById(projectId, supabase);
    console.log("suggestions: project loaded", {
      projectId,
      found: !!project,
      widget_mode: project?.widget_mode,
      language: project?.language,
      allowed_urls: project?.allowed_urls,
    });
    const isKnowledgebase = project?.widget_mode === "knowledgebase";

    // In article mode, url/title/content are required
    if (!isKnowledgebase && (!url || !title || !content)) {
      return errorResp(
        "suggestions: missing required fields:url,title,content",
        400,
        { suggestions: [] },
      );
    }

    // Default url for knowledgebase mode
    if (!url) url = "knowledgebase";

    const requestUrl = getRequestOriginUrl(req);
    console.log("suggestions: origin check", {
      requestUrl,
      allowed_urls: project?.allowed_urls,
      projectId,
    });

    if (!isAllowedOriginStrict(requestUrl, project?.allowed_urls)) {
      console.warn("suggestions: origin not allowed", {
        attempted: requestUrl,
        allowed: project?.allowed_urls,
        projectId,
      });
      return errorResp("suggestions: origin not allowed", 403, {
        suggestions: [],
      });
    }

    // Track Event (Async)
    deps.logEvent({
      projectId,
      visitorId: visitor_id,
      sessionId: session_id,
      url,
    }, "get_suggestions");

    if (isKnowledgebase) {
      // Knowledgebase mode: generate suggestions from RAG documents
      const rateLimit = await deps.checkRateLimit(
        supabase,
        "suggestions",
        visitor_id,
        projectId,
        req.headers.get("cf-connecting-ip"),
      );
      if (rateLimit.limited) {
        return new Response(
          JSON.stringify({
            error: "Too many requests",
            retryAfter: rateLimit.retryAfterSeconds,
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "Retry-After": String(rateLimit.retryAfterSeconds),
            },
          },
        );
      }

      // Fetch RAG chunks to use as context for suggestion generation
      let ragContent = "";
      try {
        // Use a generic query to retrieve representative chunks
        const embedding = await deps.generateEmbedding(
          "frequently asked questions help guide",
        );
        const matches = await deps.searchSimilarChunks(
          supabase,
          projectId,
          embedding,
          5,
        );
        ragContent = matches.map((m: { content: string }) => m.content).join("\n\n");
      } catch (err) {
        console.error("suggestions: RAG lookup failed", err);
      }

      if (!ragContent) {
        return successResp({ suggestions: [] });
      }

      console.log("suggestions: knowledgebase mode, generating from RAG");
      const result = await deps.generateSuggestions(
        "Knowledge Base",
        ragContent,
        project?.language || "en",
      );
      const { suggestions, tokenUsage, model } = result;

      if (tokenUsage) {
        deps.insertTokenUsage(supabase, {
          projectId,
          visitorId: visitor_id,
          sessionId: session_id,
          inputTokens: tokenUsage.inputTokens,
          outputTokens: tokenUsage.outputTokens,
          model,
          endpoint: "suggestions",
          metadata: { article_url: url, language: project?.language || "en" },
        }).catch((err: unknown) => console.error("suggestions: failed to track tokens", err));
      }

      return successResp({ suggestions });
    }

    // ── Article mode (original behavior) ─────────────────────────────────────

    let article = await deps.getArticleById(url, projectId, supabase);

    if (!article) {
      article = await deps.insertArticle(
        url,
        title,
        content,
        projectId,
        supabase,
        metadata,
      );
    }

    // Return cached suggestions if available - cache hits are cheap and don't consume rate limit quota
    const cachedSuggestions = deps.extractCachedSuggestions(article);

    if (cachedSuggestions) {
      return successResp({ suggestions: cachedSuggestions });
    }

    // H-2 fix: enforce per-visitor, per-IP and per-project rate limits before hitting the AI
    // Only runs when a real AI call is needed (cache miss)
    const rateLimit = await deps.checkRateLimit(
      supabase,
      "suggestions",
      visitor_id,
      projectId,
      req.headers.get("cf-connecting-ip"),
    );
    if (rateLimit.limited) {
      return new Response(
        JSON.stringify({
          error: "Too many requests",
          retryAfter: rateLimit.retryAfterSeconds,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

    // Fallback: generate suggestions via AI
    console.log("suggestions: cache miss, generating");
    const result = await deps.generateSuggestions(
      title,
      content,
      project?.language || "en",
    );
    const { suggestions, tokenUsage, model } = result;
    console.log("suggestions: ai result", { suggestions, tokenUsage });

    // Track token usage (async, don't block)
    if (tokenUsage) {
      console.log("suggestions: inserting token usage", tokenUsage);
      deps.insertTokenUsage(supabase, {
        projectId,
        visitorId: visitor_id,
        sessionId: session_id,
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        model,
        endpoint: "suggestions",
        metadata: {
          article_url: url,
          article_id: article?.unique_id || null,
          language: project?.language || "en",
        },
      }).then(() => console.log("suggestions: token usage tracked successfully")).catch(
        (err: unknown) => console.error("suggestions: failed to track tokens", err),
      );
    } else {
      console.log("suggestions: no token usage data from AI provider");
    }

    // Cache suggestions on the article (preserve existing metadata)
    const updatedCache = {
      ...article.cache,
      suggestions,
      created_at: article.cache?.created_at || new Date().toISOString(),
    };
    await deps.updateArticleCache(article, updatedCache, supabase);

    return successResp({ suggestions });
  } catch (error: any) {
    console.error("suggestions: unhandled error", error);
    console.error("Error:", error);
    captureException(error, { handler: "suggestions" });
    return errorResp(error.message, 500);
  }
}

// ─── GET branch: CDN-cacheable cache-hit lookup ──────────────────────────
// Mirrors the cache-hit path of the POST handler (no body, no AI call, no
// rate-limit on a cache hit) but emits CDN cache headers so subsequent
// requests for the same (projectId, url) are served from Fastly without
// invoking the function at all. Misses return a short-TTL 404 so the CDN
// absorbs retry storms while the first POST/ingest runs.
async function handleGetSuggestions(
  req: Request,
  deps: SuggestionsDeps,
): Promise<Response> {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const articleUrl = url.searchParams.get("url") || "knowledgebase";

    if (!projectId) {
      return errorResp("suggestions: missing projectId", 400, { suggestions: [] });
    }

    const surrogateKey =
      `suggestions-${projectId} suggestions-${projectId}-${await urlSurrogateHash(articleUrl)}`;

    const supabase = await deps.supabaseClient();
    const project = await deps.getProjectById(projectId, supabase);

    // Lenient origin — same as /config. The CDN strips Origin on forwarded
    // GETs and warms the cache without a Referer; both paths must pass.
    const requestUrl = getRequestOriginUrl(req);
    if (!isAllowedOriginStrict(requestUrl, project?.allowed_urls)) {
      return errorResp("suggestions: origin not allowed", 403, { suggestions: [] });
    }

    const article = await deps.getArticleById(articleUrl, projectId, supabase);
    const cachedSuggestions = article ? deps.extractCachedSuggestions(article) : undefined;

    if (cachedSuggestions) {
      return successRespWithCache({ suggestions: cachedSuggestions }, 1800, 3600, surrogateKey);
    }

    return notFoundRespWithShortCache({ suggestions: [] }, surrogateKey);
  } catch (error: any) {
    console.error("suggestions: GET unhandled error", error);
    captureException(error, { handler: "suggestions", tags: { phase: "get" } });
    return errorResp(error.message, 500);
  }
}

// Fastly Surrogate-Key tokens must be ASCII-printable and reasonably short.
// Article URLs can be arbitrarily long with non-ASCII chars, so we hash to
// 16 hex chars (64 bits — collision-resistant enough for purge granularity).
async function urlSurrogateHash(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// @ts-ignore: Deno globals and JSR imports are unavailable to the editor TS server
Deno.serve(serveWithSentry("suggestions", (req: Request) => suggestionsHandler(req)));
