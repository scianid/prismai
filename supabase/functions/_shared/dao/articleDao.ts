export async function getArticleById(url: string, projectId: string, supabase: any) {
    // Look for article by URL
    const { data: article, error: articleError } = await supabase
        .from('article')
        .select('*')
        .eq('unique_id', url+projectId)
        .maybeSingle();

    if (articleError) {
        console.error('suggestions: article lookup error', articleError);
        throw articleError;
    }

    return article
}

export async function insertArticle(url: string,
    title: string,
    content: string,
    projectId: string,
    supabase: any) {
    const { error: insertError } = await supabase
        .from('article')
        .insert({
            unique_id: url+projectId,
            url,
            title,
            content,
            cache: {},
            project_id: projectId
        });

    if (insertError) {
        console.error('suggestions: article insert error', insertError);
        throw insertError;
    }

    console.log('suggestions: inserted new article', { url });
}

export function extractCachedSuggestions(article: any) {
    const cachedSuggestions = (article?.cache as { suggestions?: { id: string; question: string; answer: string | null }[] } | null)?.suggestions;
    if (Array.isArray(cachedSuggestions) && cachedSuggestions.length > 0) {
        console.log('suggestions: cache hit', { count: cachedSuggestions.length });
        return cachedSuggestions;
    }
}

export async function updateArticleCache(url: string,
    cache: Record<string, any>,
    supabase: any) {

    await supabase
        .from('article')
        .update({ cache })
        .eq('unique_id', url+cache.project_id);
    console.log('suggestions: cached', { count: cache.suggestions?.length || 0 });
}