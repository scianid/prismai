import { createClient } from 'jsr:@supabase/supabase-js@2';

export interface AnalyticsContext {
  projectId: string;
  visitorId?: string;
  sessionId?: string;
  url?: string;
  referrer?: string;
  userAgent?: string;
  ip?: string;
  geo?: {
    country?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  };
}

export async function logImpression(supabase: ReturnType<typeof createClient>, ctx: AnalyticsContext) {
  if (!ctx.projectId) return;

  try {
    const { error } = await supabase.from('analytics_impressions').insert({
      project_id: ctx.projectId,
      visitor_id: ctx.visitorId || null,
      session_id: ctx.sessionId || null,
      url: ctx.url,
      referrer: ctx.referrer,
      user_agent: ctx.userAgent,
      geo_country: ctx.geo?.country,
      geo_city: ctx.geo?.city,
      geo_lat: ctx.geo?.latitude,
      geo_lng: ctx.geo?.longitude,
    });

    if (error) {
      console.error('Analytics: Failed to log impression', error);
    }
  } catch (err) {
    console.error('Analytics: Error logging impression', err);
  }
}

export async function logEvent(
  supabase: ReturnType<typeof createClient>,
  ctx: AnalyticsContext,
  eventType: string,
  eventLabel?: string,
  eventData?: Record<string, any>
) {
  if (!ctx.projectId) return;

  try {
    const { error } = await supabase.from('analytics_events').insert({
      project_id: ctx.projectId,
      visitor_id: ctx.visitorId || null,
      session_id: ctx.sessionId || null,
      event_type: eventType,
      event_label: eventLabel,
      event_data: eventData,
    });

    if (error) {
      console.error('Analytics: Failed to log event', error);
    }
  } catch (err) {
    console.error('Analytics: Error logging event', err);
  }
}
