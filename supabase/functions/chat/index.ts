import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getRequestOriginUrl, isAllowedOrigin } from '../_shared/origin.ts';
import { logEvent } from '../_shared/analytics.ts';
import { streamAnswer, type SuggestionItem } from '../_shared/ai.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getProjectById } from "../_shared/dao/projectDao.ts";
import { errorResp, successResp } from "../_shared/responses.ts";
import { extractCachedSuggestions, getArticleById, insertArticle, updateCacheAnswer } from "../_shared/dao/articleDao.ts";


type DeepSeekStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
};

function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { projectId, questionId, question, title, content, url, visitor_id, session_id } = await req.json();

    if (!projectId || !questionId || !question || !url) {
      console.error('chat: missing fields', {
        hasProjectId: !!projectId,
        hasQuestionId: !!questionId,
        hasQuestion: !!question,
        hasUrl: !!url
      });
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = getSupabaseClient();
    const project = await getProjectById(projectId, supabase);
    

    // Verify origin
    const requestUrl = getRequestOriginUrl(req);

    if (!isAllowedOrigin(requestUrl, project?.allowed_urls))
        return errorResp('Origin not allowed', 403);

    // Track Event (Async)
    logEvent(supabase, {
      projectId,
      visitorId: visitor_id,
      sessionId: session_id
    }, 'ask_question', undefined, {
      question_text: question,
      question_id: questionId
    });

    const article = await getArticleById(url, projectId, supabase);

    if (!article)
        await insertArticle(url, title, content, projectId, supabase);

    const cacheSuggestions = extractCachedSuggestions(article);

    if (!cacheSuggestions)
        return errorResp('No cached suggestions', 404);
      

    const cachedItem = cacheSuggestions.find((s) => s.id === questionId);
    if (!cachedItem)
        return errorResp('Question not allowed', 403);

    if (cachedItem.answer)
        return successResp({ answer: cachedItem.answer, cached: true });

    const resolvedQuestion = cachedItem.question || question;
    const aiResponse = await streamAnswer(title, content, resolvedQuestion);

    if (!aiResponse.body)
      return errorResp('AI response stream unavailable', 500);

    const [clientStream, cacheStream] = aiResponse.body.tee();

    // Cache the full answer after streaming completes
    readDeepSeekStreamAndCollectAnswer(cacheStream)
      .then((answer) => updateCacheAnswer(supabase, article.unique_id, questionId, resolvedQuestion, answer))
      .catch(() => undefined);

    return new Response(clientStream, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    console.error('chat: unhandled error', error);
    return errorResp('Internal server error', 500);
  }
});

async function readDeepSeekStreamAndCollectAnswer(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const lines = part.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.replace(/^data:\s*/, '');
        if (data === '[DONE]') {
          return answer;
        }
        try {
          const json = JSON.parse(data) as DeepSeekStreamChunk;
          const delta = json?.choices?.[0]?.delta?.content;
          if (delta) answer += delta;
        } catch {
          // ignore parse errors
        }
      }
    }
  }

  return answer;
}
