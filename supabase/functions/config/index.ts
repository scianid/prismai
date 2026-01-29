import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getRequestOriginUrl, isAllowedOrigin } from '../_shared/origin.ts';
import { logImpression } from '../_shared/analytics.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { errorResp, successResp } from "../_shared/responses.ts";
import { getProjectById, getProjectConfigById } from "../_shared/dao/projectDao.ts";

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

    // Fetch project and project_config in parallel
    const [project, projectConfig] = await Promise.all([
      getProjectById(projectKey, supabase),
      getProjectConfigById(projectKey, supabase)
    ]);

    const requestUrl = getRequestOriginUrl(req);
    if (!isAllowedOrigin(requestUrl, project.allowed_urls)) 
      return errorResp('Origin not allowed', 403);

    // Resolve IP and Geo
    let ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || null;
    if (ip && ip.includes(',')) {
        ip = ip.split(',')[0].trim();
    }

    let country = req.headers.get('cf-ipcountry') || req.headers.get('x-vercel-ip-country') || null;
    let city = req.headers.get('cf-ipcity') || req.headers.get('x-vercel-ip-city') || null;

    // Track Impression (Async)
    logImpression(supabase, {
      projectId: projectKey,
      visitorId: visitor_id,
      sessionId: session_id,
      url: url || getRequestOriginUrl(req),
      referrer: referrer || req.headers.get('referer'),
      userAgent: user_agent || req.headers.get('user-agent'),
      ip: ip || undefined,
      geo: {
        country: country || undefined,
        city: city || undefined
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
      ],
      display_mode: project.display_mode || 'anchored',
      display_position: project.display_position || 'bottom-right',
      article_class: project.article_class || null,
      widget_container_class: project.widget_container_class || null,
      // Merge project_config fields (e.g., ad tag ID)
      ...(projectConfig && {
        ad_tag_id: projectConfig.ad_tag_id || null
      })
    };

    return successResp(config);
    
  } catch (error) {
    console.error('Error:', error);
    return errorResp('Internal Server Error', 500);
  }
});
