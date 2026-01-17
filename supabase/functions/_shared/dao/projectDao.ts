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