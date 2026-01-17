import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getRequestOriginUrl, isAllowedOrigin } from '../_shared/origin.ts';
import { logEvent } from '../_shared/analytics.ts';
import type { SuggestionItem } from '../_shared/ai.ts';
import { corsHeaders } from '../_shared/cors.ts';


type DeepSeekStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
};

async function updateCacheAnswer(
  supabase: ReturnType<typeof createClient>,
  url: string,
  questionId: string,
  question: string,
  answer: string
) {
  const { data: article, error } = await supabase
    .from('article')
    .select('cache')
    .eq('url', url)
    .maybeSingle();

  if (error) {
    return;
  }

  const cache = (article?.cache ?? {}) as { suggestions?: SuggestionItem[] };
  const suggestions = Array.isArray(cache.suggestions) ? cache.suggestions.slice() : [];
  const idx = suggestions.findIndex((s) => s.id === questionId);

  if (idx >= 0) {
    suggestions[idx] = { ...suggestions[idx], question, answer };
  } else {
    suggestions.push({ id: questionId, question, answer });
  }

  await supabase
    .from('article')
    .update({ cache: { ...cache, suggestions } })
    .eq('url', url);
}

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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: project, error: projectError } = await supabase
      .from('project')
      .select('allowed_urls')
      .eq('project_id', projectId)
      .single();

    if (projectError) {
      console.error('chat: project lookup error', projectError);
      throw projectError;
    }

    // Track Event (Async)
    logEvent(supabase, {
      projectId,
      visitorId: visitor_id,
      sessionId: session_id
    }, 'ask_question', undefined, {
      question_text: question,
      question_id: questionId
    });

    const requestUrl = getRequestOriginUrl(req);
    if (!isAllowedOrigin(requestUrl, project?.allowed_urls)) {
      console.error('chat: origin not allowed', { requestUrl, allowedUrls: project?.allowed_urls });
      return new Response(
        JSON.stringify({ error: 'Origin not allowed' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: article, error: articleError } = await supabase
      .from('article')
      .select('url, cache')
      .eq('url', url)
      .maybeSingle();

    if (articleError) {
      console.error('chat: article lookup error', articleError);
      throw articleError;
    }

    if (!article) {
      const { error: insertError } = await supabase
        .from('article')
        .insert({
          url,
          title: title || '',
          content: content || '',
          cache: {},
          project_id: projectId
        });

      if (insertError) {
        console.error('chat: article insert error', insertError);
        throw insertError;
      }
    }

    const cacheSuggestions = (article?.cache as { suggestions?: SuggestionItem[] } | null)?.suggestions;
    if (!Array.isArray(cacheSuggestions) || cacheSuggestions.length === 0) {
      console.error('chat: no cached suggestions', { url });
      return new Response(
        JSON.stringify({ error: 'No cached suggestions' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cachedItem = cacheSuggestions.find((s) => s.id === questionId);
    if (!cachedItem) {
      console.error('chat: question id not found in cache', { questionId, url });
      return new Response(
        JSON.stringify({ error: 'Question not allowed' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (cachedItem.answer) {
      return new Response(
        JSON.stringify({ answer: cachedItem.answer, cached: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resolvedQuestion = cachedItem.question || question;

    const apiKey = Deno.env.get('DEEPSEEK_API');
    if (!apiKey) {
      console.error('chat: missing DEEPSEEK_API secret');
      return new Response(
        JSON.stringify({ error: 'AI not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = 'You are a helpful assistant that answers questions about an article. Reply concisely.';
    const userPrompt = `Title: ${title || ''}\n\nContent:\n${content || ''}\n\nQuestion: ${resolvedQuestion}`;

    const aiResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.4,
        stream: true
      })
    });

    if (!aiResponse.ok || !aiResponse.body) {
      console.error('chat: AI request failed', { status: aiResponse.status });
      return new Response(
        JSON.stringify({ error: 'AI request failed' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const [clientStream, cacheStream] = aiResponse.body.tee();

    // Cache the full answer after streaming completes
    readDeepSeekStreamAndCollectAnswer(cacheStream)
      .then((answer) => updateCacheAnswer(supabase, url, questionId, resolvedQuestion, answer))
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
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
