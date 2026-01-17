import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getRequestOriginUrl, isAllowedOrigin } from '../_shared/origin.ts';
import { logImpression } from '../_shared/analytics.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { errorResp, successResp } from "../_shared/responses.ts";
import { getProjectById } from "../_shared/dao/projectDao.ts";

// @ts-ignore
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { projectId, 
      client_id, 
      visitor_id, 
      session_id, 
      url, 
      referrer, 
      user_agent 
    } = await req.json();

    // Use projectId or client_id
    const projectKey = projectId || client_id;

    if (!projectKey)
      return errorResp('Missing projectId or client_id', 400);

    const supabase = await supabaseClient();

    const project = await getProjectById(projectKey, supabase);

    const requestUrl = getRequestOriginUrl(req);
    if (!isAllowedOrigin(requestUrl, project.allowed_urls)) 
      return errorResp('Origin not allowed', 403);

    // Track Impression (Async)
    logImpression(supabase, {
      projectId: projectKey,
      visitorId: visitor_id,
      sessionId: session_id,
      url: url || getRequestOriginUrl(req),
      referrer: referrer || req.headers.get('referer'),
      userAgent: user_agent || req.headers.get('user-agent'),
      ip: req.headers.get('x-forwarded-for') || undefined,
      geo: {
        country: req.headers.get('x-vercel-ip-country') || undefined,
        city: req.headers.get('x-vercel-ip-city') || undefined
      }
    });
    
    // Map database fields to widget config format
    const config = {
      direction: project.direction || 'ltr',
      language: project.language || 'en',
      icon_url: project.icon_url || '',
      client_name: project.client_name || '',
      client_description: project.client_description || '',
      highlight_color: project.highlight_color || ['#68E5FD', '#A389E0'],
      show_ad: typeof project.show_ad === 'boolean' ? project.show_ad : true,
      input_text_placeholders: project.input_text_placeholders || [
        'Ask anything about this article...'
      ]
    };

    return successResp(config);
    
  } catch (error) {
    console.error('Error:', error);
    return errorResp('Internal Server Error', 500);
  }
});
