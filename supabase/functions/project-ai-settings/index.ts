import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseClient } from '../_shared/supabaseClient.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAdminAccess } from '../_shared/adminAuth.ts';
import { getProjectAiSettings, upsertProjectAiSettings } from '../_shared/dao/projectAiSettingsDao.ts';

// @ts-ignore
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = await supabaseClient();
    const authHeader = req.headers.get('Authorization');

    if (req.method === 'GET') {
      const projectId = new URL(req.url).searchParams.get('project_id');
      if (!projectId) {
        return jsonResp({ error: 'Missing project_id' }, 400);
      }

      await verifyAdminAccess(supabase, authHeader, projectId);

      const settings = await getProjectAiSettings(supabase, projectId);
      return jsonResp(settings ?? { project_id: projectId, tone: null, guardrails: [], custom_instructions: null });
    }

    if (req.method === 'PUT') {
      const body = await req.json();
      const { project_id, tone, guardrails, custom_instructions } = body;

      if (!project_id) return jsonResp({ error: 'Missing project_id' }, 400);

      // Validate guardrails is an array of strings
      if (guardrails !== undefined && (!Array.isArray(guardrails) || guardrails.some((g: unknown) => typeof g !== 'string'))) {
        return jsonResp({ error: 'guardrails must be an array of strings' }, 400);
      }

      await verifyAdminAccess(supabase, authHeader, project_id);

      const result = await upsertProjectAiSettings(supabase, {
        project_id,
        tone: tone ?? null,
        guardrails: guardrails ?? [],
        custom_instructions: custom_instructions ?? null
      });

      return jsonResp(result);
    }

    return jsonResp({ error: 'Method not allowed' }, 405);
  } catch (err: unknown) {
    // verifyAdminAccess throws a Response directly
    if (err instanceof Response) return err;
    console.error('project-ai-settings: unhandled error', err);
    return jsonResp({ error: 'Internal server error' }, 500);
  }
});

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
