import { SupabaseClient } from '@supabase/supabase-js'

export type ConversationRecord = {
  id: string;
  project_id: string;
  article_unique_id: string;
  visitor_id: string;
  session_id: string;
  article_title: string;
  article_content: string;
  messages: ConversationMessage[];
  started_at: string;
  last_message_at: string;
  message_count: number;
  total_chars: number;
};

export type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
  char_count: number;
  created_at: string;
};

/**
 * Get or create conversation for visitor + article combination
 */
export async function getOrCreateConversation(
  supabase: SupabaseClient,
  projectId: string,
  articleUniqueId: string,
  visitorId: string,
  sessionId: string,
  articleTitle: string,
  articleContent: string
): Promise<ConversationRecord | null> {
  // Try to find existing conversation
  const { data: existing, error: fetchError } = await supabase
    .from('conversations')
    .select('*')
    .eq('visitor_id', visitorId)
    .eq('article_unique_id', articleUniqueId)
    .eq('project_id', projectId)
    .single();

  if (existing && !fetchError) {
    return existing as ConversationRecord;
  }

  // Create new conversation
  const { data: newConv, error: insertError } = await supabase
    .from('conversations')
    .insert({
      project_id: projectId,
      article_unique_id: articleUniqueId,
      visitor_id: visitorId,
      session_id: sessionId,
      article_title: articleTitle,
      article_content: articleContent,
      messages: [],
      message_count: 0,
      total_chars: 0
    })
    .select()
    .single();

  if (insertError) {
    console.error('conversationDao: failed to create conversation', insertError);
    return null;
  }

  return newConv as ConversationRecord;
}

/**
 * Append messages to conversation (user + assistant)
 */
export async function appendMessagesToConversation(
  supabase: SupabaseClient,
  conversationId: string,
  userMessage: ConversationMessage,
  assistantMessage: ConversationMessage,
  existingMessages: ConversationMessage[],
  existingTotalChars: number
): Promise<boolean> {
  const updatedMessages = [...existingMessages, userMessage, assistantMessage];
  const newTotalChars = existingTotalChars + userMessage.char_count + assistantMessage.char_count;

  const { error } = await supabase
    .from('conversations')
    .update({
      messages: updatedMessages,
      last_message_at: new Date().toISOString(),
      message_count: updatedMessages.length,
      total_chars: newTotalChars
    })
    .eq('id', conversationId);

  if (error) {
    console.error('conversationDao: failed to append messages', error);
    return false;
  }

  return true;
}

/**
 * Get conversation by ID
 */
export async function getConversationById(
  supabase: SupabaseClient,
  conversationId: string
): Promise<ConversationRecord | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  if (error || !data) {
    console.error('conversationDao: failed to get conversation', error);
    return null;
  }

  return data as ConversationRecord;
}

/**
 * Reset conversation (clear messages)
 */
export async function resetConversation(
  supabase: SupabaseClient,
  visitorId: string,
  articleUniqueId: string,
  projectId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('conversations')
    .update({
      messages: [],
      message_count: 0,
      total_chars: 0,
      last_message_at: new Date().toISOString()
    })
    .eq('visitor_id', visitorId)
    .eq('article_unique_id', articleUniqueId)
    .eq('project_id', projectId)
    .select('id')
    .single();

  if (error || !data) {
    console.error('conversationDao: failed to reset conversation', error);
    return null;
  }

  return data.id;
}

/**
 * List conversations for a visitor
 */
export async function listConversationsByVisitor(
  supabase: SupabaseClient,
  visitorId: string,
  projectId: string
): Promise<ConversationRecord[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('visitor_id', visitorId)
    .eq('project_id', projectId)
    .order('last_message_at', { ascending: false });

  if (error) {
    console.error('conversationDao: failed to list conversations', error);
    return [];
  }

  return (data || []) as ConversationRecord[];
}

/**
 * Delete conversation
 */
export async function deleteConversation(
  supabase: SupabaseClient,
  conversationId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId);

  if (error) {
    console.error('conversationDao: failed to delete conversation', error);
    return false;
  }

  return true;
}
