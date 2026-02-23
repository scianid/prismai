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
    'widget_visible',
    'widget_expanded',
    'widget_collapsed',
    'open_chat',
    'textarea_focused',
    'suggestions_fetched',
    'suggestions_reopened',
    'suggestion_clicked',
    'suggestion_shown',
    'suggestion_x_clicked',
    'suggestion_dismissed_cancelled',
    'suggestion_dismissed_confirmed',
    'click_suggestion',
    'question_asked',
    'ask_question',
    'answer_streamed',
    'ad_impression',
    'ad_unfilled',
    'ad_refresh',
] as const;

type AllowedEventType = typeof ALLOWED_EVENT_TYPES[number];

/**
 * M-6 fix: sanitize event_data before storing.
 *
 * Rejects event_data that:
 *  - exceeds 2 KB when JSON-serialised (storage amplification guard)
 *  - contains nested objects or arrays (all legitimate widget payloads are flat)
 * Truncates individual string values to 500 characters.
 * Returns null if event_data is absent, not a plain object, or oversized (caller skips storing it).
 */
function sanitizeEventData(
  raw: Record<string, unknown> | null | undefined
): Record<string, string | number | boolean | null> | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const sanitized: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(raw)) {
    // Reject nested objects / arrays — legitimate widget data is always flat
    if (value !== null && typeof value === 'object') {
      console.warn(`analytics: event_data key "${key}" contains a non-primitive value — dropped`);
      continue;
    }
    // Truncate long strings
    if (typeof value === 'string') {
      sanitized[key] = value.length > 500 ? value.substring(0, 500) : value;
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      sanitized[key] = value;
    }
    // Any other type (undefined, symbol, function) is silently dropped
  }

  // 2 KB hard cap on the serialised payload
  const serialised = JSON.stringify(sanitized);
  if (serialised.length > 2048) {
    console.warn(`analytics: event_data exceeds 2 KB limit (${serialised.length} bytes) — dropped`);
    return null;
  }

  return sanitized;
}

interface AnalyticsEvent {
    project_id: string;
    visitor_id?: string;
    session_id?: string;
    event_type: string;
    event_label?: string;
    event_data?: Record<string, unknown>;
    timestamp?: number;
}

async function processEvent(
    event: AnalyticsEvent,
    supabase: ReturnType<typeof supabaseClient> extends Promise<infer T> ? T : never,
    req: Request
): Promise<{ success: boolean; error?: string }> {
    const { project_id, visitor_id, session_id, event_type, event_label, event_data } = event;

    if (!project_id || !event_type) {
        return { success: false, error: 'Missing required fields: project_id and event_type' };
    }

    // Validate event type
    if (!ALLOWED_EVENT_TYPES.includes(event_type as AllowedEventType)) {
        // Log warning but don't fail - allows forward compatibility
        console.warn(`Unknown event_type: ${event_type}`);
        return { success: false, error: `Invalid event_type: ${event_type}` };
    }

    // M-6 fix: sanitize event_data before use
    const safeEventData = sanitizeEventData(event_data);
    // H-1 fix: trust only cf-connecting-ip, which Cloudflare injects and clients cannot spoof.
    // Supabase Edge Functions always run on Cloudflare Workers, making this the correct
    // authoritative header regardless of any upstream CDN in front of the origin site.
    const clientIp = req.headers.get('cf-connecting-ip') ?? undefined;

    // Extract analytics context from request
    const context: AnalyticsContext = {
        projectId: project_id,
        visitorId: visitor_id,
        sessionId: session_id,
        url: safeEventData?.url as string || req.headers.get('referer') || undefined,
        referrer: safeEventData?.referrer as string || req.headers.get('referer') || undefined,
        userAgent: req.headers.get('user-agent') || undefined,
        ip: clientIp,
    };

    // Handle impression separately to use logImpression with geo enrichment
    if (event_type === 'impression') {
        await logImpression(supabase, context);
    } else {
        // Log the event
        await logEvent(supabase, context, event_type, event_label, safeEventData ?? undefined);
    }

    return { success: true };
}

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Parse request body
        const body = await req.json();

        // Create Supabase client
        const supabase = await supabaseClient();

        // Check if this is a batch request
        if (body.batch && Array.isArray(body.batch)) {
            // Process batch of events
            const events: AnalyticsEvent[] = body.batch;
            
            if (events.length === 0) {
                return new Response(
                    JSON.stringify({ error: 'Empty batch' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Validate all events belong to the same project (security check)
            const projectIds = [...new Set(events.map(e => e.project_id))];
            if (projectIds.length > 1) {
                return new Response(
                    JSON.stringify({ error: 'All events in a batch must belong to the same project' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const projectId = projectIds[0];
            if (!projectId) {
                return new Response(
                    JSON.stringify({ error: 'Missing project_id in batch events' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Validate project exists
            let project;
            try {
                project = await getProjectById(projectId, supabase);
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

            // Process all events in parallel
            const results = await Promise.allSettled(
                events.map(event => processEvent(event, supabase, req))
            );

            const processed = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            const failed = results.length - processed;

            return new Response(
                JSON.stringify({ success: true, processed, failed, total: events.length }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Single event (backward compatible)
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

        // M-6 fix: sanitize event_data in single-event path
        const safeEventData = sanitizeEventData(event_data);

        // H-1 fix: trust only cf-connecting-ip, which Cloudflare injects and clients cannot spoof.
        // Supabase Edge Functions always run on Cloudflare Workers, making this the correct
        // authoritative header regardless of any upstream CDN in front of the origin site.
        const clientIp = req.headers.get('cf-connecting-ip') ?? undefined;

        // Extract analytics context from request
        const context: AnalyticsContext = {
            projectId: project_id,
            visitorId: visitor_id,
            sessionId: session_id,
            url: safeEventData?.url as string || req.headers.get('referer') || undefined,
            referrer: safeEventData?.referrer as string || req.headers.get('referer') || undefined,
            userAgent: req.headers.get('user-agent') || undefined,
            ip: clientIp,
        };

        // Handle impression separately to use logImpression with geo enrichment
        if (event_type === 'impression') {
            await logImpression(supabase, context);
        } else {
            // Log the event
            await logEvent(supabase, context, event_type, event_label, safeEventData ?? undefined);
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
