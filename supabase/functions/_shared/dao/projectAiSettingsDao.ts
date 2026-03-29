export type ProjectAiSettings = {
  project_id: string;
  tone: string | null;
  guardrails: string[];
  custom_instructions: string | null;
};

/**
 * Fetch AI customization settings for a project.
 * Returns null if no row exists (backwards-compatible: callers treat null as "no customization").
 */
export async function getProjectAiSettings(
  supabase: any,
  projectId: string
): Promise<ProjectAiSettings | null> {
  const { data, error } = await supabase
    .from('project_ai_settings')
    .select('project_id, tone, guardrails, custom_instructions')
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) {
    console.error('projectAiSettingsDao: fetch error', error);
    throw error;
  }

  return data ?? null;
}

/**
 * Insert or update AI customization settings for a project.
 */
export async function upsertProjectAiSettings(
  supabase: any,
  settings: Omit<ProjectAiSettings, 'project_id'> & { project_id: string }
): Promise<ProjectAiSettings> {
  const { data, error } = await supabase
    .from('project_ai_settings')
    .upsert(
      { ...settings, updated_at: new Date().toISOString() },
      { onConflict: 'project_id' }
    )
    .select('project_id, tone, guardrails, custom_instructions')
    .single();

  if (error) {
    console.error('projectAiSettingsDao: upsert error', error);
    throw error;
  }

  return data;
}
