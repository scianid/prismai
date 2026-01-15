import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { isAllowedOrigin } from '../_shared/origin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateSuggestions(title: string, content: string): string[] {
  // TODO: Replace with AI-generated suggestions based on title/content
  return [
    'Summarize this article in 3 key points',
    'What are the main arguments presented?',
    'What are the practical implications?'
  ];
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { projectId, articleId, title, content, url } = await req.json();

    if (!projectId) {
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
      .select('allowed_urls')
      .eq('project_id', projectId)
      .single();

    if (projectError) {
      throw projectError;
    }

    if (!isAllowedOrigin(url, project?.allowed_urls)) {
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
        throw insertError;
      }
    }

    // Return cached suggestions if available
    const cachedSuggestions = (article?.cache as { suggestions?: string[] } | null)?.suggestions;
    if (Array.isArray(cachedSuggestions) && cachedSuggestions.length > 0) {
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
    const suggestions = generateSuggestions(title, content);

    // Cache suggestions on the article
    await supabase
      .from('article')
      .update({ cache: { suggestions } })
      .eq('url', url);

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
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
