import "jsr:@supabase/functions-js@2/edge-runtime.d.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { getRequestOriginUrl, isAllowedOrigin } from "../_shared/origin.ts";
import { logEvent } from "../_shared/analytics.ts";
import {
  type AiCustomization,
  type Message,
  readStreamAndCollectAnswer,
  streamWorldcupAnswer,
} from "../_shared/ai.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getProjectById } from "../_shared/dao/projectDao.ts";
import { enforceContentLength, errorResp } from "../_shared/responses.ts";
import { hashForLog } from "../_shared/logSafe.ts";
import {
  getArticleById,
  insertArticle,
} from "../_shared/dao/articleDao.ts";
import { insertFreeformQuestion, updateFreeformAnswer } from "../_shared/dao/freeformQaDao.ts";
import { sanitizeContent } from "../_shared/constants.ts";
import { classifySensitive } from "../_shared/classifySensitive.ts";
import {
  appendMessagesToConversation,
  type ConversationMessage,
  getOrCreateConversation,
} from "../_shared/dao/conversationDao.ts";
import { insertTokenUsage } from "../_shared/dao/tokenUsageDao.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { getProjectAiSettings } from "../_shared/dao/projectAiSettingsDao.ts";
import { captureException, serveWithSentry } from "../_shared/sentry.ts";

// ─── Dependency injection seam ────────────────────────────────────────────
// `chatHandler` takes a `ChatDeps` object so unit tests can stub external
// services (OpenAI, Supabase DAOs, rate limiter, RAG embeddings). Production
// wires the real implementations below via `realDeps` and calls the handler
// from Deno.serve. Tests construct their own deps and call `chatHandler`
// directly — no network, no env setup beyond what Deno itself needs.
export interface ChatDeps {
  supabaseClient: typeof supabaseClient;
  getProjectById: typeof getProjectById;
  getProjectAiSettings: typeof getProjectAiSettings;
  checkRateLimit: typeof checkRateLimit;
  getArticleById: typeof getArticleById;
  insertArticle: typeof insertArticle;
  getOrCreateConversation: typeof getOrCreateConversation;
  appendMessagesToConversation: typeof appendMessagesToConversation;
  insertFreeformQuestion: typeof insertFreeformQuestion;
  updateFreeformAnswer: typeof updateFreeformAnswer;
  insertTokenUsage: typeof insertTokenUsage;
  logEvent: typeof logEvent;
  streamAnswer: typeof streamWorldcupAnswer;
  readStreamAndCollectAnswer: typeof readStreamAndCollectAnswer;
  classifySensitive: typeof classifySensitive;
}

export const realChatDeps: ChatDeps = {
  supabaseClient,
  getProjectById,
  getProjectAiSettings,
  checkRateLimit,
  getArticleById,
  insertArticle,
  getOrCreateConversation,
  appendMessagesToConversation,
  insertFreeformQuestion,
  updateFreeformAnswer,
  insertTokenUsage,
  logEvent,
  streamAnswer: streamWorldcupAnswer,
  readStreamAndCollectAnswer,
  classifySensitive,
};

export async function chatHandler(
  req: Request,
  deps: ChatDeps = realChatDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Worldcup payloads are tiny: a question + a few UUIDs + a URL. There's no
  // article body or title to forward. 8KB is plenty of headroom for the JSON
  // envelope and any reasonable user input — anything bigger is malformed or
  // adversarial. (The original /chat endpoint allows 256KB to fit publisher
  // article bodies, which don't apply here.)
  const oversize = enforceContentLength(req, 8192);
  if (oversize) return oversize;

  try {
    let {
      projectId,
      questionId,
      question,
      url,
      visitor_id,
      session_id,
    } = await req.json();

    // Truncate then sanitize the user-typed question - mitigates stored
    // prompt injection (C-1). title/content fields are ignored: worldcup
    // chat doesn't have an article context.
    if (question) question = sanitizeContent(question.substring(0, 200)).trim();

    // Server-side Art. 9 classifier — backstop for the client-side regex
    // layer in the widget. Runs ONLY on user-typed `question` (article title
    // and content are publisher-supplied and out of scope for Art. 9).
    // Replaces detected spans with `[redacted]` BEFORE the question reaches
    // the AI prompt, the conversation transcript, or `freeform_qa`. See
    // SPECIAL_CATEGORY_DATA_PLAN.md §3b.
    let sensitiveHits: string[] = [];
    if (question) {
      const classified = deps.classifySensitive(question);
      question = classified.text;
      sensitiveHits = classified.hits;
    }

    if (!projectId || !questionId || !question || !url) {
      console.error("chat-worldcup: missing fields", {
        hasProjectId: !!projectId,
        hasQuestionId: !!questionId,
        hasQuestion: !!question,
        hasUrl: !!url,
      });
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = await deps.supabaseClient();

    // Run project lookup and AI settings fetch in parallel
    const [project, aiSettings] = await Promise.all([
      deps.getProjectById(projectId, supabase),
      deps.getProjectAiSettings(supabase, projectId).catch((err) => {
        // Non-fatal: if settings can't be loaded, proceed without customization
        console.error(
          "chat-worldcup: failed to load ai settings, proceeding without customization",
          err,
        );
        return null;
      }),
    ]);

    // Verify origin
    const requestUrl = getRequestOriginUrl(req);

    if (!isAllowedOrigin(requestUrl, project?.allowed_urls)) {
      console.error("chat-worldcup: origin not allowed", {
        attempted: requestUrl,
        allowed: project?.allowed_urls,
        projectId,
      });
      return errorResp("Origin not allowed", 403);
    }

    // H-2 fix: enforce per-visitor, per-IP and per-project rate limits before hitting the AI
    const rateLimit = await deps.checkRateLimit(
      supabase,
      "chat",
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

    // Worldcup queries don't have real article content (the sports widget
    // doesn't sit on a publisher article). We still need an article row for
    // each unique page URL because conversations FK to it — create an empty
    // placeholder on first visit, keep it on subsequent visits.
    let article = await deps.getArticleById(url, projectId, supabase);
    if (!article) {
      console.log("chat-worldcup: creating placeholder article", { url, projectId });
      await deps.insertArticle(url, "", "", projectId, supabase, undefined);
      article = await deps.getArticleById(url, projectId, supabase);
    }

    // Get or create conversation (per visitor + article)
    // Use same format as article.unique_id (no dash)
    const articleUniqueId = url + projectId;
    // SECURITY_AUDIT_TODO item 4: log the visitor hash, not the raw ID.
    // Incident response can still correlate by recomputing
    // hashForLog(knownVisitorId, projectId).
    console.log("chat-worldcup: getting/creating conversation", {
      articleUniqueId,
      visitorHash: await hashForLog(visitor_id, projectId),
      projectId,
      hasArticle: !!article,
    });

    const conversation = await deps.getOrCreateConversation(
      supabase,
      projectId,
      articleUniqueId,
      visitor_id,
      session_id,
      "",
      "",
    );

    console.log("chat-worldcup: conversation result", {
      conversationId: conversation?.id,
      messageCount: conversation?.message_count,
      hasConversation: !!conversation,
    });

    if (!conversation) {
      console.error("chat-worldcup: failed to get/create conversation");
      return errorResp("Failed to create conversation", 500);
    }

    // Check conversation message limit
    if (conversation.message_count >= 100) {
      return new Response(
        JSON.stringify({ error: "Conversation limit reached", limit: 100 }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Track Event (Async)
    deps.logEvent(
      {
        projectId,
        visitorId: visitor_id,
        sessionId: session_id,
        articleUrl: url,
      },
      conversation.message_count === 0 ? "conversation_started" : "conversation_continued",
      undefined,
    );

    // Worldcup mode is always freeform — every question goes straight to
    // streamWorldcupAnswer. There's no suggestion cache and no cached-answer
    // short-circuit (the sports widget doesn't render suggestion chips).
    deps.logEvent(
      { projectId, visitorId: visitor_id, sessionId: session_id, articleUrl: url },
      "custom_question_asked",
    );

    // Server-side Art. 9 telemetry — one event per unique category that
    // fired, with the count carried in the label. visitor_id and session_id
    // are deliberately omitted to avoid creating a linkage of "visitor X had
    // a `health` disclosure on date Y".
    if (sensitiveHits.length > 0) {
      const counts = new Map<string, number>();
      for (const cat of sensitiveHits) counts.set(cat, (counts.get(cat) ?? 0) + 1);
      for (const [category, count] of counts) {
        deps.logEvent(
          { projectId, articleUrl: url },
          "sensitive_data_detected",
          `${category}:${count}`,
        );
      }
    }

    // Build AI context — just conversation history, no article content. The
    // worldcup placeholder article has no title/body, so we prune purely on
    // conversation length.
    const messages = conversation.messages || [];
    const MAX_CONVERSATION_CHARS = 100000;

    let totalChars = 0;
    const prunedMessages: ConversationMessage[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      totalChars += messages[i].char_count;
      if (totalChars <= MAX_CONVERSATION_CHARS) {
        prunedMessages.unshift(messages[i]);
      } else {
        break;
      }
    }

    // streamWorldcupAnswer prepends its own worldcup system prompt and filters
    // out any system message we pass; just hand it the conversation history
    // plus the new user question.
    const aiMessages: Message[] = [
      ...prunedMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: question },
    ];

    // Pass tone/guardrails/custom_instructions from project AI settings if
    // present. RAG chunks are intentionally not used — file_search inside
    // streamWorldcupAnswer handles the World Cup PDF library.
    const customization: AiCustomization | undefined = aiSettings
      ? {
        tone: aiSettings.tone,
        guardrails: aiSettings.guardrails,
        custom_instructions: aiSettings.custom_instructions,
      }
      : undefined;

    // Note: deps.streamAnswer is wired to streamWorldcupAnswer for chat-worldcup
    // (see realChatDeps override above) — this calls the OpenAI Agent Builder /
    // ChatKit workflow, not the raw Responses API.
    const { response: aiResponse, model: aiModel } = await deps.streamAnswer(
      aiMessages,
      customization,
    );

    if (!aiResponse.body) {
      return errorResp("AI response stream unavailable", 500);
    }

    const [clientStream, cacheStream] = aiResponse.body.tee();

    // Collect answer and store in conversation
    deps.readStreamAndCollectAnswer(cacheStream)
      .then(async (result) => {
        const { answer, tokenUsage } = result;
        console.log("chat-worldcup: collected answer, appending to conversation", {
          conversationId: conversation.id,
          questionLength: question.length,
          answerLength: answer.length,
          existingMessageCount: messages.length,
          tokenUsage,
        });

        // Track token usage (async, don't block)
        if (tokenUsage) {
          deps.insertTokenUsage(supabase, {
            projectId,
            conversationId: conversation.id,
            visitorId: visitor_id,
            sessionId: session_id,
            inputTokens: tokenUsage.inputTokens,
            outputTokens: tokenUsage.outputTokens,
            model: aiModel,
            // tokenUsageDao only knows "chat" | "suggestions" today — bucket
            // worldcup tokens with chat, but tag them via metadata.source_endpoint
            // and the `model` field ("worldcup:..." from streamWorldcupAnswer)
            // so they can be split out in analytics.
            endpoint: "chat",
            metadata: {
              question_id: questionId,
              question_type: "custom",
              article_url: url,
              source_endpoint: "chat-worldcup",
            },
          }).catch((err) => console.error("chat-worldcup: failed to track tokens", err));
        }

        // Append to the conversation transcript
        const userMessage: ConversationMessage = {
          role: "user",
          content: question,
          char_count: question.length,
          created_at: new Date().toISOString(),
        };
        const assistantMessage: ConversationMessage = {
          role: "assistant",
          content: answer,
          char_count: answer.length,
          created_at: new Date().toISOString(),
        };
        await deps.appendMessagesToConversation(
          supabase,
          conversation.id,
          userMessage,
          assistantMessage,
          messages,
          conversation.total_chars,
        );

        // Track in freeform_qa for publisher analytics ("what are visitors
        // asking?"). Worldcup is always freeform — no cached suggestion
        // branch to update.
        const freeformId = await deps.insertFreeformQuestion(
          supabase,
          projectId,
          article.unique_id,
          question,
          visitor_id,
          session_id,
        );
        if (freeformId) {
          await deps.updateFreeformAnswer(supabase, freeformId, answer);
        }
      })
      .catch((err) => {
        console.error("chat-worldcup: failed to cache answer", err);
        captureException(err, {
          handler: "chat-worldcup",
          tags: { phase: "post_stream" },
          extra: { conversationId: conversation.id, projectId },
        });
      });

    return new Response(clientStream, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Conversation-Id": conversation.id,
      },
    });
  } catch (error) {
    console.error("chat-worldcup: unhandled error", error);
    captureException(error, { handler: "chat-worldcup" });
    return errorResp("Internal server error", 500);
  }
}

// @ts-ignore: Deno globals and JSR imports are unavailable to the editor TS server
Deno.serve(serveWithSentry("chat-worldcup", (req: Request) => chatHandler(req)));
