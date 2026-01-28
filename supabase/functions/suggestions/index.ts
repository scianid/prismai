import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getRequestOriginUrl, isAllowedOrigin } from '../_shared/origin.ts';
import { generateSuggestions } from '../_shared/ai.ts';
import { logEvent } from '../_shared/analytics.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { errorResp, successResp } from '../_shared/responses.ts';
import { getProjectById } from '../_shared/dao/projectDao.ts';
import { extractCachedSuggestions, getArticleById, insertArticle, updateArticleCache, updateArticleImage } from '../_shared/dao/articleDao.ts';
import { supabaseClient } from '../_shared/supabaseClient.ts';
import { MAX_CONTENT_LENGTH, MAX_TITLE_LENGTH } from "../_shared/constants.ts";

// @ts-ignore
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let { projectId, title, content, url, visitor_id, session_id, metadata } = await req.json();

    // Truncate inputs
    if (title) title = title.substring(0, MAX_TITLE_LENGTH);
    if (content) content = content.substring(0, MAX_CONTENT_LENGTH);

    if (!projectId) 
      return errorResp('suggestions: missing projectId', 400, { suggestions: [] });
  
    // Validate required fields
    if (!url || !title || !content) 
      return errorResp('suggestions: missing required fields:url,title,content', 400, { suggestions: [] });

    // Initialize Supabase client with service role key (bypasses RLS)
    const supabase = await supabaseClient();

    const project = await getProjectById(projectId, supabase);
    const requestUrl = getRequestOriginUrl(req);

    if (!isAllowedOrigin(requestUrl, project?.allowed_urls))
      return errorResp('suggestions: origin not allowed', 403, { suggestions: [] });

    // Track Event (Async)
    logEvent(supabase, {
      projectId,
      visitorId: visitor_id,
      sessionId: session_id
    }, 'get_suggestions');

    let article = await getArticleById(url, projectId, supabase);

    if (!article) {
      article = await insertArticle(url, title, content, projectId, supabase, metadata);
    } else {
      // Update existing article with image if missing
      const needsImageUpdate = !article.image_url && metadata && (metadata.og_image || metadata.image_url);
      
      if (needsImageUpdate) {
        console.log('suggestions: updating article with image');
        const imageUrl = metadata.og_image || metadata.image_url;
        await updateArticleImage(article, imageUrl!, supabase);
        article.image_url = imageUrl;
      }
    }

    // Return cached suggestions if available
    const cachedSuggestions = extractCachedSuggestions(article);
    
    if (cachedSuggestions)
      return successResp({ suggestions: cachedSuggestions });
    

    // Fallback: generate hard-coded suggestions
    console.log('suggestions: cache miss, generating');
    const suggestions = await generateSuggestions(title, content, project?.language || 'en');
    console.log('suggestions: ai result', suggestions);

    // Cache suggestions on the article (preserve existing metadata)
    const updatedCache = {
      ...article.cache,
      suggestions,
      created_at: article.cache?.created_at || new Date().toISOString()
    };
    await updateArticleCache(article, updatedCache, supabase);

    return successResp({ suggestions });

  } catch (error: any) {
    console.error('suggestions: unhandled error', error);
    console.error('Error:', error);
    return errorResp(error.message, 500);
  }
});
