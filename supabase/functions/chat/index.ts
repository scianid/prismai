import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseClient } from '../_shared/supabaseClient.ts';
import { getRequestOriginUrl, isAllowedOrigin } from '../_shared/origin.ts';
import { logEvent } from '../_shared/analytics.ts';
import { readDeepSeekStreamAndCollectAnswer, streamAnswer, estimateCharCount, type Message } from '../_shared/ai.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getProjectById } from "../_shared/dao/projectDao.ts";
import { errorResp, successResp } from "../_shared/responses.ts";
import { extractCachedSuggestions, getArticleById, insertArticle, updateCacheAnswer } from "../_shared/dao/articleDao.ts";
import { insertFreeformQuestion, updateFreeformAnswer } from "../_shared/dao/freeformQaDao.ts";
import { MAX_CONTENT_LENGTH, MAX_TITLE_LENGTH } from "../_shared/constants.ts";
import { getOrCreateConversation, appendMessagesToConversation, type ConversationMessage } from "../_shared/dao/conversationDao.ts";

// @ts-ignore
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let { projectId, questionId, question, title, content, url, visitor_id, session_id } = await req.json();

    // Truncate inputs
    if (title) title = title.substring(0, MAX_TITLE_LENGTH);
    if (content) content = content.substring(0, MAX_CONTENT_LENGTH);

    if (!projectId || !questionId || !question || !url) {
      console.error('chat: missing fields', {
        hasProjectId: !!projectId,
        hasQuestionId: !!questionId,
        hasQuestion: !!question,
        hasUrl: !!url
      });
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = await supabaseClient();
    const project = await getProjectById(projectId, supabase);
    

    // Verify origin
    const requestUrl = getRequestOriginUrl(req);

    if (!isAllowedOrigin(requestUrl, project?.allowed_urls))
        return errorResp('Origin not allowed', 403);

    // Ensure article exists first (required for conversation foreign key)
    let article = await getArticleById(url, projectId, supabase);
    if (!article) {
        console.log('chat: creating new article', { url, projectId });
        await insertArticle(url, title, content, projectId, supabase);
        // Re-fetch to get the created article
        article = await getArticleById(url, projectId, supabase);
    }

    // Get or create conversation (per visitor + article)
    // Use same format as article.unique_id (no dash)
    const articleUniqueId = url + projectId;
    console.log('chat: getting/creating conversation', { 
      articleUniqueId, 
      visitor_id, 
      projectId,
      hasArticle: !!article 
    });
    
    const conversation = await getOrCreateConversation(
      supabase,
      projectId,
      articleUniqueId,
      visitor_id,
      session_id,
      title,
      content
    );

    console.log('chat: conversation result', { 
      conversationId: conversation?.id,
      messageCount: conversation?.message_count,
      hasConversation: !!conversation
    });

    if (!conversation) {
      console.error('chat: failed to get/create conversation');
      return errorResp('Failed to create conversation', 500);
    }

    // Check conversation message limit
    if (conversation.message_count >= 20) {
      return new Response(
        JSON.stringify({ error: 'Conversation limit reached', limit: 20 }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Track Event (Async)
    logEvent(supabase, {
      projectId,
      visitorId: visitor_id,
      sessionId: session_id
    }, conversation.message_count === 0 ? 'conversation_started' : 'conversation_continued', undefined, {
      question_text: question,
      question_id: questionId,
      conversation_id: conversation.id,
      message_count: conversation.message_count
    });

    const cacheSuggestions = extractCachedSuggestions(article);

    // @ts-ignore
    const allowFreeForm = Deno.env.get('ALLOW_FREEFORM_ASK') === 'true';

    // If no cache and no freeform, we can't do anything
    if (!cacheSuggestions && !allowFreeForm)
        return errorResp('No cached suggestions', 404);
      

    const cachedItem = cacheSuggestions?.find((s) => s.id === questionId);
    
    // If request entails a specific question ID not in cache, and freeform is disabled
    if (!cachedItem && !allowFreeForm)
        return errorResp('Question not allowed', 403);

    // Check for cached answer (only for suggestions, not conversations)
    if (cachedItem?.answer && conversation.message_count === 0)
        return successResp({ answer: cachedItem.answer, cached: true });

    // Build AI context with conversation history
    const messages = conversation.messages || [];
    const articleTitle = conversation.article_title;
    const articleContent = conversation.article_content;

    // Character-based pruning (100k limit)
    const ARTICLE_CHARS = (articleTitle + articleContent).length;
    const MAX_CONVERSATION_CHARS = 100000;
    const AVAILABLE_CHARS = MAX_CONVERSATION_CHARS - ARTICLE_CHARS;

    let totalChars = 0;
    const prunedMessages: ConversationMessage[] = [];
    
    // Read from end (newest first), keep until hitting limit
    for (let i = messages.length - 1; i >= 0; i--) {
      totalChars += messages[i].char_count;
      if (totalChars <= AVAILABLE_CHARS) {
        prunedMessages.unshift(messages[i]);
      } else {
        break;
      }
    }

    // @ts-ignore
    const rejectUnrelatedQuestions = Deno.env.get('REJECT_UNRELATED_QUESTIONS') === 'true';
    
    const denyUnrelatedQuestionsPrompt = `
      Do not answer questions unrelated to the article.
      If the question is not related to the article, reply with:
      "I'm sorry, I can only answer questions related to the article." but in the same language as the question.  
    `;

    const systemPrompt = `You are a helpful assistant that answers questions about an article or subjects related to the article. 
      Reply concisely in under 1000 characters but make sure you respond fully.
      under any circumstance, do not mention you are an AI model.
      if you cant base your answer on the article content, use your own knowledge - but you must say that it did not appear in the article!
      ${rejectUnrelatedQuestions ? denyUnrelatedQuestionsPrompt : ''}
    `;

    // Build message array for AI
    const aiMessages: Message[] = [
      { role: 'system', content: systemPrompt },
      { 
        role: 'user', 
        content: `[Article Context - Reference for all questions]\nTitle: ${articleTitle}\n\nContent: ${articleContent}` 
      },
      ...prunedMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: question }
    ];

    const resolvedQuestion = cachedItem?.question || question;
    const aiResponse = await streamAnswer(aiMessages);

    if (!aiResponse.body)
      return errorResp('AI response stream unavailable', 500);

    const [clientStream, cacheStream] = aiResponse.body.tee();

    // Collect answer and store in conversation
    readDeepSeekStreamAndCollectAnswer(cacheStream)
      .then(async (answer) => {
        console.log('chat: collected answer, appending to conversation', {
          conversationId: conversation.id,
          questionLength: resolvedQuestion.length,
          answerLength: answer.length,
          existingMessageCount: messages.length
        });

        // Create message objects
        const userMessage: ConversationMessage = {
          role: 'user',
          content: resolvedQuestion,
          char_count: resolvedQuestion.length,
          created_at: new Date().toISOString()
        };

        const assistantMessage: ConversationMessage = {
          role: 'assistant',
          content: answer,
          char_count: answer.length,
          created_at: new Date().toISOString()
        };

        // Append to conversation
        const success = await appendMessagesToConversation(
          supabase,
          conversation.id,
          userMessage,
          assistantMessage,
          messages,
          conversation.total_chars
        );

        console.log('chat: append messages result', { success, conversationId: conversation.id });

        // Also update cache if it's a suggestion
        if (cachedItem) {
          await updateCacheAnswer(supabase, article.unique_id, questionId, resolvedQuestion, answer);
        } else if (allowFreeForm) {
          // Store in freeform_qa for backwards compatibility
          const freeformId = await insertFreeformQuestion(supabase, projectId, article.unique_id, resolvedQuestion, visitor_id, session_id);
          if (freeformId) {
            await updateFreeformAnswer(supabase, freeformId, answer);
          }
        }
      })
      .catch((err) => {
        console.error('chat: failed to cache answer', err);
      });

    return new Response(clientStream, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Conversation-Id': conversation.id
      }
    });
  } catch (error) {
    console.error('chat: unhandled error', error);
    return errorResp('Internal server error', 500);
  }
});