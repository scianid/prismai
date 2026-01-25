import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseClient } from '../_shared/supabaseClient.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { errorResp, successResp } from "../_shared/responses.ts";
import { 
  getConversationById, 
  listConversationsByVisitor, 
  resetConversation,
  deleteConversation
} from "../_shared/dao/conversationDao.ts";

// @ts-ignore
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  try {
    const supabase = await supabaseClient();

    // GET /conversations - List conversations for a visitor
    if (req.method === 'GET' && pathParts.length === 1) {
      const visitorId = url.searchParams.get('visitor_id');
      const projectId = url.searchParams.get('project_id');

      if (!visitorId || !projectId) {
        return errorResp('Missing visitor_id or project_id', 400);
      }

      const conversations = await listConversationsByVisitor(supabase, visitorId, projectId);
      
      // Return simplified list
      const simplified = conversations.map(conv => ({
        id: conv.id,
        article_title: conv.article_title,
        article_url: conv.article_unique_id.split('-')[0], // Extract URL from unique_id
        last_message_at: conv.last_message_at,
        message_count: conv.message_count
      }));

      return successResp({ conversations: simplified });
    }

    // GET /conversations/:id/messages - Get messages for a conversation
    if (req.method === 'GET' && pathParts.length === 3 && pathParts[2] === 'messages') {
      const conversationId = pathParts[1];

      const conversation = await getConversationById(supabase, conversationId);
      
      if (!conversation) {
        return errorResp('Conversation not found', 404);
      }

      return successResp({ messages: conversation.messages || [] });
    }

    // POST /conversations/reset - Reset conversation (clear messages)
    if (req.method === 'POST' && pathParts.length === 2 && pathParts[1] === 'reset') {
      const { visitor_id, article_unique_id, project_id } = await req.json();

      if (!visitor_id || !article_unique_id || !project_id) {
        return errorResp('Missing required fields', 400);
      }

      const conversationId = await resetConversation(supabase, visitor_id, article_unique_id, project_id);
      
      if (!conversationId) {
        return errorResp('Failed to reset conversation', 500);
      }

      return successResp({ conversation_id: conversationId });
    }

    // DELETE /conversations/:id - Delete conversation
    if (req.method === 'DELETE' && pathParts.length === 2) {
      const conversationId = pathParts[1];

      const success = await deleteConversation(supabase, conversationId);
      
      if (!success) {
        return errorResp('Failed to delete conversation', 500);
      }

      return successResp({ success: true });
    }

    return errorResp('Not found', 404);
  } catch (error) {
    console.error('conversations: unhandled error', error);
    return errorResp('Internal server error', 500);
  }
});
