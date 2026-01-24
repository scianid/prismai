/**
 * Widget Core Functionality Tests
 * Tests for widget.js initialization and core methods
 */

const { describe, test, expect, beforeEach, jest } = require('@jest/globals');

describe('DiveeWidget Core', () => {
  let mockConfig;
  
  beforeEach(() => {
    // Clear DOM
    document.body.innerHTML = '';
    
    // Reset localStorage and sessionStorage
    localStorage.clear();
    sessionStorage.clear();
    
    // Mock config
    mockConfig = {
      projectId: 'test-project-123',
      apiBaseUrl: 'https://api.test.com'
    };
    
    // Mock fetch responses
    fetch.mockClear();
  });

  describe('UUID Generation', () => {
    test('should generate valid UUID', () => {
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      const uuid = widget.generateUUID();
      
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    test('should use crypto.randomUUID if available', () => {
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      const uuid = widget.generateUUID();
      
      expect(crypto.randomUUID).toHaveBeenCalled();
      expect(uuid).toBe('test-uuid-1234-5678-90ab-cdef');
    });
  });

  describe('Analytics IDs', () => {
    test('should generate and store visitor ID in localStorage', () => {
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      localStorage.getItem.mockReturnValue(null);
      
      const widget = new DiveeWidget(mockConfig);
      const { visitorId } = widget.getAnalyticsIds();
      
      expect(visitorId).toBe('test-uuid-1234-5678-90ab-cdef');
      expect(localStorage.setItem).toHaveBeenCalledWith('divee_visitor_id', visitorId);
    });

    test('should reuse existing visitor ID from localStorage', () => {
      const existingId = 'existing-visitor-id';
      localStorage.getItem.mockReturnValue(existingId);
      
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      const { visitorId } = widget.getAnalyticsIds();
      
      expect(visitorId).toBe(existingId);
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    test('should generate and store session ID in sessionStorage', () => {
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      sessionStorage.getItem.mockReturnValue(null);
      
      const widget = new DiveeWidget(mockConfig);
      const { sessionId } = widget.getAnalyticsIds();
      
      expect(sessionId).toBe('test-uuid-1234-5678-90ab-cdef');
      expect(sessionStorage.setItem).toHaveBeenCalledWith('divee_session_id', sessionId);
    });

    test('should reuse existing session ID from sessionStorage', () => {
      const existingId = 'existing-session-id';
      sessionStorage.getItem.mockReturnValue(existingId);
      
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      const { sessionId } = widget.getAnalyticsIds();
      
      expect(sessionId).toBe(existingId);
      expect(sessionStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('Debug Mode', () => {
    test('should detect debug mode from URL parameter', () => {
      // Mock URLSearchParams
      const originalLocation = window.location;
      delete window.location;
      window.location = {
        ...originalLocation,
        search: '?diveeDebug=true'
      };
      
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      expect(widget.isDebugMode()).toBe(true);
      
      // Restore
      window.location = originalLocation;
    });

    test('should not be in debug mode without parameter', () => {
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      expect(widget.isDebugMode()).toBe(false);
    });
  });

  describe('Configuration', () => {
    test('should use provided apiBaseUrl', () => {
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      expect(widget.config.apiBaseUrl).toBe('https://api.test.com');
    });

    test('should use default apiBaseUrl if not provided', () => {
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget({ projectId: 'test' });
      expect(widget.config.apiBaseUrl).toBe('http://localhost:3000/api/v1');
    });

    test('should have default display mode as anchored', () => {
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      expect(widget.config.displayMode).toBe('anchored');
    });

    test('should have default floating position as bottom-right', () => {
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      expect(widget.config.floatingPosition).toBe('bottom-right');
    });
  });

  describe('Default Config', () => {
    test('should return valid default config', () => {
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      const defaultConfig = widget.getDefaultConfig();
      
      expect(defaultConfig).toHaveProperty('direction', 'ltr');
      expect(defaultConfig).toHaveProperty('language', 'en');
      expect(defaultConfig).toHaveProperty('show_ad', true);
      expect(defaultConfig.input_text_placeholders).toBeInstanceOf(Array);
      expect(defaultConfig.highlight_color).toBeInstanceOf(Array);
    });
  });

  describe('Content Caching', () => {
    test('should cache extracted content', () => {
      document.body.innerHTML = `
        <article>
          <h1>Test Article</h1>
          <p>This is test content that should be cached properly.</p>
        </article>
      `;
      
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      const contentJs = require('fs').readFileSync('./src/content.js', 'utf8');
      eval(contentJs);
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      widget.extractArticleContent();
      
      expect(widget.contentCache.extracted).toBe(true);
      expect(widget.contentCache.content).toBeTruthy();
      expect(widget.contentCache.title).toBeTruthy();
      expect(widget.contentCache.url).toBeTruthy();
    });

    test('should use cached content on subsequent calls', () => {
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      
      // Set cached content
      widget.contentCache = {
        content: 'Cached content',
        title: 'Cached title',
        url: 'https://cached.com',
        extracted: true
      };
      
      // Call extract again
      widget.extractArticleContent();
      
      // Should use cached values
      expect(widget.articleTitle).toBe('Cached title');
      expect(widget.articleContent).toBe('Cached content');
    });
  });

  describe('State Management', () => {
    test('should initialize with collapsed state', () => {
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      expect(widget.state.isExpanded).toBe(false);
    });

    test('should initialize with empty messages', () => {
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      expect(widget.state.messages).toEqual([]);
    });

    test('should initialize with empty suggestions', () => {
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      expect(widget.state.suggestions).toEqual([]);
    });

    test('should not be streaming initially', () => {
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      expect(widget.state.isStreaming).toBe(false);
    });
  });
});
