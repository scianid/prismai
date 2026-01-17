import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getRequestOriginUrl, isAllowedOrigin } from '../_shared/origin.ts';
import { generateSuggestions } from '../_shared/ai.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { errorResp, successResp } from '../_shared/responses.ts';
import { getProjectById } from '../_shared/dao/projectDao.ts';
import { extractCachedSuggestions, getArticleById, insertArticle, updateArticleCache } from '../_shared/dao/articleDao.ts';

function supabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { projectId, title, content, url } = await req.json();

    if (!projectId) 
      return errorResp('suggestions: missing projectId', 400, { suggestions: [] });
  
    // Validate required fields
    if (!url || !title || !content) 
      return errorResp('suggestions: missing required fields:url,title,content', 400, { suggestions: [] });

    // Initialize Supabase client with service role key (bypasses RLS)
    const supabase = supabaseClient();

    const project = await getProjectById(projectId, supabase);
    const requestUrl = getRequestOriginUrl(req);

    if (!isAllowedOrigin(requestUrl, project?.allowed_urls))
      return errorResp('suggestions: origin not allowed', 403, { suggestions: [] });


    const article = await getArticleById(url, supabase);

    if (!article) 
      await insertArticle(url, title, content, projectId, supabase);

    // Return cached suggestions if available
    const cachedSuggestions = extractCachedSuggestions(article);
    
    if (cachedSuggestions)
      return successResp({ suggestions: cachedSuggestions });
    

    // Fallback: generate hard-coded suggestions
    console.log('suggestions: cache miss, generating');
    const suggestions = await generateSuggestions(title, content, project?.language || 'en');
    console.log('suggestions: ai result', suggestions);

    // Cache suggestions on the article
    await updateArticleCache(url, { suggestions }, supabase);

    return successResp({ suggestions });

  } catch (error: any) {
    console.error('suggestions: unhandled error', error);
    console.error('Error:', error);
    return errorResp(error.message, 500);
  }
});
