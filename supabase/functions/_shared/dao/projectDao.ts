export async function getProjectById(projectId: string, supabase:any) {
    // Verify origin against allowed URLs
    const { data: project, error: projectError } = await supabase
        .from('project')
        .select('*')
        .eq('project_id', projectId)
        .single();

    if (projectError) {
        console.error('suggestions: project lookup error', projectError);
        throw projectError;
    }

    return project;
}

export async function getProjectConfigById(projectId: string, supabase:any) {
    const { data: projectConfig, error: projectConfigError } = await supabase
        .from('project_config')
        .select('*')
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