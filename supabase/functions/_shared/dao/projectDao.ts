export async function getProjectById(projectId: string, supabase:any) {
    // L-3 fix: select only the columns consumed by edge functions; exclude
    // internal fields (account_id, created_at) that are never read by callers.
    const { data: project, error: projectError } = await supabase
        .from('project')
        .select('project_id, allowed_urls, direction, language, icon_url, client_name, client_description, highlight_color, show_ad, input_text_placeholders, display_mode, display_position, article_class, widget_container_class, override_mobile_container_selector')
        .eq('project_id', projectId)
        .single();

    if (projectError) {
        console.error('suggestions: project lookup error', projectError);
        throw projectError;
    }

    return project;
}

export async function getProjectConfigById(projectId: string, supabase:any) {
    // L-3 fix: select only the columns returned to the widget (ad_tag_id and
    // ad size overrides); exclude commercial/audit fields (revenue_share_percentage,
    // ad_tag_id_locked, deleted_at, deleted_by, ad_tag_id_updated_by/at).
    const { data: projectConfig, error: projectConfigError } = await supabase
        .from('project_config')
        .select('project_id, ad_tag_id, override_mobile_ad_size, override_desktop_ad_size')
        .eq('project_id', projectId)
        .single();

    if (projectConfigError) {
        // Return null if no config found (not all projects have config)
        if (projectConfigError.code === 'PGRST116') {
            return null;
        }
        console.error('project_config lookup error', projectConfigError);
        throw projectConfigError;
    }

    return projectConfig;
}