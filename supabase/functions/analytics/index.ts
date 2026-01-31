// @ts-ignore
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { logEvent, logImpression, type AnalyticsContext } from '../_shared/analytics.ts';
import { getRequestOriginUrl, isAllowedOrigin } from '../_shared/origin.ts';
import { supabaseClient } from '../_shared/supabaseClient.ts';
import { getProjectById } from '../_shared/dao/projectDao.ts';

// Allowed event types for analytics tracking
const ALLOWED_EVENT_TYPES = [
    'impression',
    'widget_loaded',
    'widget_expanded',
    'widget_collapsed',
    'open_chat',
    'textarea_focused',
    'suggestions_fetched',
    'suggestions_reopened',
    'suggestion_clicked',
    'click_suggestion',
    'question_asked',
    'ask_question',
    'answer_streamed',
    'ad_impression',
    'ad_click',
] as const;

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Parse request body
        const body = await req.json();
        const { project_id, visitor_id, session_id, event_type, event_label, event_data } = body;

        if (!project_id || !event_type) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: project_id and event_type' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate event type
        if (!ALLOWED_EVENT_TYPES.includes(event_type)) {
            return new Response(
                JSON.stringify({ error: `Invalid event_type. Allowed types: ${ALLOWED_EVENT_TYPES.join(', ')}` }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Create Supabase client
        const supabase = await supabaseClient();

        // Validate project exists
        let project;
        try {
            project = await getProjectById(project_id, supabase);
        } catch (error) {
            return new Response(
                JSON.stringify({ error: 'Invalid project_id' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate origin is allowed for this project
        const requestUrl = getRequestOriginUrl(req);
        if (!isAllowedOrigin(requestUrl, project.allowed_urls)) {
            return new Response(
                JSON.stringify({ error: 'Origin not allowed' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Extract analytics context from request
        const context: AnalyticsContext = {
            projectId: project_id,
            visitorId: visitor_id,
            sessionId: session_id,
            url: event_data?.url || req.headers.get('referer') || undefined,
            referrer: event_data?.referrer || req.headers.get('referer') || undefined,
            userAgent: req.headers.get('user-agent') || undefined,
            ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
        };

        // Handle impression separately to use logImpression with geo enrichment
        if (event_type === 'impression') {
            await logImpression(supabase, context);
        } else {
            // Log the event
            await logEvent(supabase, context, event_type, event_label, event_data);
        }

        return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Error processing analytics event:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
