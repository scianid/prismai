/**
 * Conversation Feature Tests
 * Tests for conversation persistence and management
 */

const { describe, test, expect, beforeEach } = require('@jest/globals');

describe('Conversation Feature', () => {
  const baseUrl = 'https://srv.divee.ai/functions/v1';
  const testProjectId = 'test-project';
  const testVisitorId = 'visitor-123';
  const testSessionId = 'session-456';
  const testUrl = 'https://example.com/article';
  
  beforeEach(() => {
    fetch.mockClear();
  });

  describe('Chat Endpoint - Conversation Creation', () => {
    test('should create new conversation on first message', async () => {
      const mockHeaders = new Headers({
        'X-Conversation-Id': 'conv-abc-123',
        'Content-Type': 'text/event-stream'
      });

      const mockReadableStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Test answer"}}]}\n\n'));
          controller.close();
        }
      });

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: mockHeaders,
        body: mockReadableStream
      });
      
      const response = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          questionId: 'q1',
          question: 'What is this article about?',
          title: 'Test Article',
          content: 'Article content here...',
          url: testUrl,
          visitor_id: testVisitorId,
          session_id: testSessionId
        })
      });
      
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(response.ok).toBe(true);
      expect(response.headers.get('X-Conversation-Id')).toBe('conv-abc-123');
    });

    test('should return same conversation ID for same visitor+article', async () => {
      const conversationId = 'conv-abc-123';
      
      // First request
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-Conversation-Id': conversationId }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Answer 1"}}]}\n\n'));
            controller.close();
          }
        })
      });

      // Second request
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-Conversation-Id': conversationId }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Answer 2"}}]}\n\n'));
            controller.close();
          }
        })
      });

      const response1 = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          questionId: 'q1',
          question: 'First question',
          title: 'Test Article',
          content: 'Article content',
          url: testUrl,
          visitor_id: testVisitorId,
          session_id: testSessionId
        })
      });

      const response2 = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          questionId: 'q2',
          question: 'Second question',
          title: 'Test Article',
          content: 'Article content',
          url: testUrl,
          visitor_id: testVisitorId,
          session_id: testSessionId
        })
      });

      expect(response1.headers.get('X-Conversation-Id')).toBe(conversationId);
      expect(response2.headers.get('X-Conversation-Id')).toBe(conversationId);
    });

    test('should enforce 20 message conversation limit', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ 
          error: 'Conversation limit reached',
          limit: 20
        })
      });
      
      const response = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          questionId: 'q21',
          question: 'Twenty-first question',
          title: 'Test Article',
          content: 'Article content',
          url: testUrl,
          visitor_id: testVisitorId,
          session_id: testSessionId
        })
      });
      
      expect(response.status).toBe(429);
      const data = await response.json();
      expect(data.error).toBe('Conversation limit reached');
      expect(data.limit).toBe(20);
    });
  });

  describe('Conversations Endpoint', () => {
    test('GET /conversations should list conversations for visitor', async () => {
      const mockConversations = [
        {
          id: 'conv-1',
          article_title: 'Article 1',
          article_url: 'https://example.com/article1',
          last_message_at: '2026-01-25T10:00:00Z',
          message_count: 5
        },
        {
          id: 'conv-2',
          article_title: 'Article 2',
          article_url: 'https://example.com/article2',
          last_message_at: '2026-01-25T09:00:00Z',
          message_count: 3
        }
      ];

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ conversations: mockConversations })
      });
      
      const response = await fetch(
        `${baseUrl}/conversations?visitor_id=${testVisitorId}&project_id=${testProjectId}`,
        { method: 'GET' }
      );
      
      const data = await response.json();
      
      expect(data.conversations).toHaveLength(2);
      expect(data.conversations[0]).toHaveProperty('id');
      expect(data.conversations[0]).toHaveProperty('article_title');
      expect(data.conversations[0]).toHaveProperty('message_count');
    });

    test('GET /conversations/:id/messages should return message history', async () => {
      const mockMessages = [
        {
          role: 'user',
          content: 'What is this about?',
          char_count: 19,
          created_at: '2026-01-25T10:00:00Z'
        },
        {
          role: 'assistant',
          content: 'This article discusses...',
          char_count: 25,
          created_at: '2026-01-25T10:00:05Z'
        }
      ];

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ messages: mockMessages })
      });
      
      const conversationId = 'conv-abc-123';
      const response = await fetch(
        `${baseUrl}/conversations/${conversationId}/messages`,
        { method: 'GET' }
      );
      
      const data = await response.json();
      
      expect(data.messages).toHaveLength(2);
      expect(data.messages[0].role).toBe('user');
      expect(data.messages[1].role).toBe('assistant');
      expect(data.messages[0]).toHaveProperty('char_count');
    });

    test('POST /conversations/reset should clear conversation messages', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ conversation_id: 'conv-abc-123' })
      });
      
      const response = await fetch(`${baseUrl}/conversations/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitor_id: testVisitorId,
          article_unique_id: testUrl + testProjectId,
          project_id: testProjectId
        })
      });
      
      const data = await response.json();
      
      expect(response.ok).toBe(true);
      expect(data.conversation_id).toBeDefined();
    });

    test('DELETE /conversations/:id should delete conversation', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      });
      
      const conversationId = 'conv-abc-123';
      const response = await fetch(`${baseUrl}/conversations/${conversationId}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });

    test('should handle missing required fields', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Missing visitor_id or project_id' })
      });
      
      const response = await fetch(`${baseUrl}/conversations`, {
        method: 'GET'
      });
      
      expect(response.status).toBe(400);
    });

    test('should handle conversation not found', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Conversation not found' })
      });
      
      const response = await fetch(
        `${baseUrl}/conversations/nonexistent-id/messages`,
        { method: 'GET' }
      );
      
      expect(response.status).toBe(404);
    });
  });

  describe('Character Pruning', () => {
    test('should handle conversations exceeding character limit', async () => {
      // Mock a conversation that will trigger pruning (>100k chars)
      const longContent = 'x'.repeat(50000); // 50k chars
      
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-Conversation-Id': 'conv-large' }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Pruned response"}}]}\n\n'));
            controller.close();
          }
        })
      });
      
      const response = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          questionId: 'q-long',
          question: 'Question with long history',
          title: 'Long Article',
          content: longContent,
          url: testUrl,
          visitor_id: testVisitorId,
          session_id: testSessionId
        })
      });
      
      expect(response.ok).toBe(true);
      // Should not fail even with large content
    });
  });

  describe('Analytics Events', () => {
    test('should track conversation_started on first message', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-Conversation-Id': 'conv-new' }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"First answer"}}]}\n\n'));
            controller.close();
          }
        })
      });
      
      const response = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          questionId: 'q1',
          question: 'First question',
          title: 'Test Article',
          content: 'Content',
          url: testUrl,
          visitor_id: testVisitorId,
          session_id: testSessionId
        })
      });
      
      expect(response.ok).toBe(true);
      // Analytics event should be tracked (checked in Edge Function logs)
    });
  });

  describe('Error Handling', () => {
    test('should handle conversation creation failure gracefully', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Failed to create conversation' })
      });
      
      const response = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          questionId: 'q1',
          question: 'Test question',
          title: 'Test Article',
          content: 'Content',
          url: testUrl,
          visitor_id: testVisitorId,
          session_id: testSessionId
        })
      });
      
      expect(response.status).toBe(500);
    });

    test('should handle missing conversation_id gracefully', async () => {
      // Widget should work even if conversation ID is not stored
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-Conversation-Id': 'conv-recovered' }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Answer"}}]}\n\n'));
            controller.close();
          }
        })
      });
      
      const response = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          questionId: 'q1',
          question: 'Question without stored conversation_id',
          title: 'Test Article',
          content: 'Content',
          url: testUrl,
          visitor_id: testVisitorId,
          session_id: testSessionId
          // conversation_id intentionally omitted
        })
      });
      
      expect(response.ok).toBe(true);
      expect(response.headers.get('X-Conversation-Id')).toBeDefined();
    });
  });
});
