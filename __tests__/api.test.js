/**
 * Backend API Tests
 * Tests for Edge Function endpoints
 */

const { describe, test, expect, beforeEach } = require('@jest/globals');

describe('Backend API Endpoints', () => {
  const baseUrl = 'https://srv.divee.ai/functions/v1';
  
  beforeEach(() => {
    fetch.mockClear();
  });

  describe('Config Endpoint', () => {
    test('POST /config should return project configuration', async () => {
      const mockResponse = {
        direction: 'ltr',
        language: 'en',
        icon_url: 'https://example.com/icon.png',
        client_name: 'Test Site',
        show_ad: true,
        display_mode: 'anchored'
      };
      
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      });
      
      const response = await fetch(`${baseUrl}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'test-project',
          visitor_id: 'visitor-123',
          session_id: 'session-456'
        })
      });
      
      const data = await response.json();
      
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/config`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
      expect(data).toEqual(mockResponse);
    });

    test('should handle missing projectId', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Missing projectId or client_id' })
      });
      
      const response = await fetch(`${baseUrl}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeTruthy();
    });

    test('should handle origin not allowed', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Origin not allowed' })
      });
      
      const response = await fetch(`${baseUrl}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'test-project'
        })
      });
      
      expect(response.status).toBe(403);
    });
  });

  describe('Suggestions Endpoint', () => {
    test('POST /suggestions should return suggestions array', async () => {
      const mockSuggestions = [
        { id: 'q1', question: 'What is the main topic?' },
        { id: 'q2', question: 'Who are the key people mentioned?' },
        { id: 'q3', question: 'What are the implications?' }
      ];
      
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ suggestions: mockSuggestions })
      });
      
      const response = await fetch(`${baseUrl}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'test-project',
          title: 'Test Article',
          content: 'Article content here...',
          url: 'https://example.com/article'
        })
      });
      
      const data = await response.json();
      
      expect(data.suggestions).toHaveLength(3);
      expect(data.suggestions[0]).toHaveProperty('id');
      expect(data.suggestions[0]).toHaveProperty('question');
    });

    test('should handle missing required fields', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ 
          error: 'missing required fields:url,title,content',
          suggestions: []
        })
      });
      
      const response = await fetch(`${baseUrl}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'test-project'
        })
      });
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.suggestions).toEqual([]);
    });

    test('should return cached suggestions on repeat request', async () => {
      const mockSuggestions = [
        { id: 'q1', question: 'Cached question 1?' }
      ];
      
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ suggestions: mockSuggestions })
      });
      
      const payload = {
        projectId: 'test-project',
        title: 'Test Article',
        content: 'Content',
        url: 'https://example.com/same-article'
      };
      
      // First request
      await fetch(`${baseUrl}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      // Second request (should be cached on server side)
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ suggestions: mockSuggestions })
      });
      
      const response2 = await fetch(`${baseUrl}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response2.json();
      expect(data.suggestions).toEqual(mockSuggestions);
    });
  });

  describe('Chat Endpoint', () => {
    test('POST /chat should stream response', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":" world"}}]}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        }
      });
      
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body: mockStream
      });
      
      const response = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'test-project',
          questionId: 'q1',
          question: 'Test question',
          title: 'Article',
          content: 'Content',
          url: 'https://example.com/article'
        })
      });
      
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toBe('text/event-stream');
    });

    test('should return cached answer if available', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ 
          answer: 'Cached answer',
          cached: true
        })
      });
      
      const response = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'test-project',
          questionId: 'q1',
          question: 'Previously asked question',
          url: 'https://example.com/article'
        })
      });
      
      const data = await response.json();
      expect(data.cached).toBe(true);
      expect(data.answer).toBeTruthy();
    });

    test('should reject freeform questions when disabled', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Question not allowed' })
      });
      
      const response = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'test-project',
          questionId: 'custom-q',
          question: 'Random question not in suggestions',
          url: 'https://example.com/article'
        })
      });
      
      expect(response.status).toBe(403);
    });

    test('should handle missing required fields', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Missing required fields' })
      });
      
      const response = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'test-project'
        })
      });
      
      expect(response.status).toBe(400);
    });
  });

  describe('Analytics Endpoint', () => {
    test('POST /analytics should accept valid events', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      });
      
      const response = await fetch(`${baseUrl}/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: 'test-project',
          visitor_id: 'visitor-123',
          session_id: 'session-456',
          event_type: 'widget_loaded',
          event_data: {}
        })
      });
      
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    test('should reject invalid event types', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ 
          error: 'Invalid event_type. Allowed types: widget_loaded, widget_expanded, ...'
        })
      });
      
      const response = await fetch(`${baseUrl}/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: 'test-project',
          visitor_id: 'visitor-123',
          session_id: 'session-456',
          event_type: 'invalid_event',
          event_data: {}
        })
      });
      
      expect(response.status).toBe(400);
    });

    test('should handle missing required fields', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ 
          error: 'Missing required fields: project_id and event_type'
        })
      });
      
      const response = await fetch(`${baseUrl}/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitor_id: 'visitor-123'
        })
      });
      
      expect(response.status).toBe(400);
    });
  });

  describe('CORS', () => {
    test('should handle OPTIONS preflight request', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        })
      });
      
      const response = await fetch(`${baseUrl}/config`, {
        method: 'OPTIONS'
      });
      
      expect(response.ok).toBe(true);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});
