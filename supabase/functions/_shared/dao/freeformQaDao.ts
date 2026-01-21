import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface FreeformQa {
  id?: number;
  project_id: string;
  article_unique_id: string;
  visitor_id?: string;
  session_id?: string;
  question: string;
  answer?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Insert a new free-form question into the database
 */
export async function insertFreeformQuestion(
  supabase: SupabaseClient,
  projectId: string,
  articleUniqueId: string,
  question: string,
  visitorId?: string,
  sessionId?: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from('freeform_qa')
    .insert({
      project_id: projectId,
      article_unique_id: articleUniqueId,
      visitor_id: visitorId,
      session_id: sessionId,
      question: question,
      answer: null
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error inserting freeform question:', error);
    return null;
  }

  return data?.id || null;
}

/**
 * Update a free-form Q&A record with the answer
 */
export async function updateFreeformAnswer(
  supabase: SupabaseClient,
  id: number,
  answer: string
): Promise<boolean> {
  const { error } = await supabase
    .from('freeform_qa')
    .update({
      answer: answer,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    console.error('Error updating freeform answer:', error);
    return false;
  }

  return true;
}

/**
 * Get all free-form Q&As for a specific article
 */
export async function getFreeformQasByArticle(
  supabase: SupabaseClient,
  articleUniqueId: string
): Promise<FreeformQa[]> {
  const { data, error } = await supabase
    .from('freeform_qa')
    .select('*')
    .eq('article_unique_id', articleUniqueId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching freeform QAs:', error);
    return [];
  }

  return data || [];
}

/**
 * Get all free-form Q&As for a specific project
 */
export async function getFreeformQasByProject(
  supabase: SupabaseClient,
  projectId: string,
  limit: number = 100
): Promise<FreeformQa[]> {
  const { data, error } = await supabase
    .from('freeform_qa')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching freeform QAs:', error);
    return [];
  }

  return data || [];
}
