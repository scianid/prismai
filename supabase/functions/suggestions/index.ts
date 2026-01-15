import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getRequestOriginUrl, isAllowedOrigin } from '../_shared/origin.ts';
import { generateSuggestions } from '../_shared/ai.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};


Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { projectId, articleId, title, content, url } = await req.json();

    if (!projectId) {
      console.error('suggestions: missing projectId');
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { 
          status: 400, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'Connection': 'keep-alive'
          } 
        }
      );
    }

    // Validate required fields
    if (!url || !title || !content) {
      console.error('suggestions: missing fields', {
        hasUrl: !!url,
        hasTitle: !!title,
        hasContent: !!content
      });
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { 
          status: 200, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'Connection': 'keep-alive'
          } 
        }
      );
    }

    // Initialize Supabase client with service role key (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify origin against allowed URLs
    const { data: project, error: projectError } = await supabase
      .from('project')
      .select('allowed_urls, language')
      .eq('project_id', projectId)
      .single();

    if (projectError) {
      console.error('suggestions: project lookup error', projectError);
      throw projectError;
    }

    const requestUrl = getRequestOriginUrl(req);
    if (!isAllowedOrigin(requestUrl, project?.allowed_urls)) {
      console.error('suggestions: origin not allowed', { requestUrl, allowedUrls: project?.allowed_urls });
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { 
          status: 403, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'Connection': 'keep-alive'
          } 
        }
      );
    }

    // Look for article by URL
    const { data: article, error: articleError } = await supabase
      .from('article')
      .select('url, cache')
      .eq('url', url)
      .maybeSingle();

    if (articleError) {
      console.error('suggestions: article lookup error', articleError);
      throw articleError;
    }

    // If article doesn't exist, save it
    if (!article) {
      const { error: insertError } = await supabase
        .from('article')
        .insert({
          url,
          title,
          content,
          cache: {},
          project_id: projectId ?? null
        });

      if (insertError) {
        console.error('suggestions: article insert error', insertError);
        throw insertError;
      }
    }

    // Return cached suggestions if available
    const cachedSuggestions = (article?.cache as { suggestions?: { id: string; question: string; answer: string | null }[] } | null)?.suggestions;
    if (Array.isArray(cachedSuggestions) && cachedSuggestions.length > 0) {
      console.log('suggestions: cache hit', { count: cachedSuggestions.length });
      return new Response(
        JSON.stringify({ suggestions: cachedSuggestions }),
        { 
          status: 200, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'Connection': 'keep-alive'
          } 
        }
      );
    }

    // Fallback: generate hard-coded suggestions
    console.log('suggestions: cache miss, generating', { language: project?.language || 'en' });
    const suggestions = await generateSuggestions(title, content, project?.language || 'en');
    console.log('suggestions: ai result', suggestions);

    // Cache suggestions on the article
    await supabase
      .from('article')
      .update({ cache: { suggestions } })
      .eq('url', url);
    console.log('suggestions: cached', { count: suggestions.length });

    return new Response(
      JSON.stringify({ suggestions }),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Connection': 'keep-alive'
        } 
      }
    );
  } catch (error) {
    console.error('suggestions: unhandled error', error);
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
