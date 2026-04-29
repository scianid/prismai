/**
 * Widget Core Functionality Tests
 * Tests for widget.js initialization and core methods
 */

const { describe, test, expect, beforeEach } = require('@jest/globals');

describe('DiveeWidget Core', () => {
  let mockConfig;
  
  beforeEach(() => {
    // Clear DOM
    document.body.innerHTML = '';

    // Reset localStorage and sessionStorage
    localStorage.clear();
    sessionStorage.clear();
    // Reset singleton guard so each test can re-eval the widget script
    delete window.__diveeWidgetLoaded;
    
    // Mock config
    mockConfig = {
      projectId: 'test-project-123',
      nonCacheBaseUrl: 'https://api.test.com'
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
      
      // In test environment, crypto.randomUUID is mocked
      expect(uuid).toBeTruthy();
      expect(typeof uuid).toBe('string');
      expect(uuid.length).toBeGreaterThan(0);
      
      expect(crypto.randomUUID).toHaveBeenCalled();
      expect(uuid).toBe('test-uuid-1234-5678-90ab-cdef');
    });
  });

  describe('Analytics IDs', () => {
    test.skip('should generate and store visitor ID in localStorage', () => {
      // Skipped: localStorage mock inside eval doesn't work properly
      // Test this in E2E tests where real storage is available
      localStorage.getItem.mockReturnValueOnce(null);
      
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      const { visitorId } = widget.getAnalyticsIds();
      
      expect(visitorId).toBe('test-uuid-1234-5678-90ab-cdef');
      expect(localStorage.setItem).toHaveBeenCalledWith('divee_visitor_id', visitorId);
    });

    test.skip('should reuse existing visitor ID from localStorage', () => {
      // Skipped: localStorage mock inside eval doesn't work properly
      // Test this in E2E tests where real storage is available
      const existingId = 'existing-visitor-id';
      localStorage.getItem.mockReturnValueOnce(existingId);
      
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      const { visitorId } = widget.getAnalyticsIds();
      
      expect(visitorId).toBe(existingId);
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    test.skip('should generate and store session ID in sessionStorage', () => {
      // Skipped: sessionStorage mock inside eval doesn't work properly
      // Test this in E2E tests where real storage is available
      localStorage.getItem.mockReturnValueOnce('visitor-id');
      sessionStorage.getItem.mockReturnValueOnce(null);
      
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      const { sessionId } = widget.getAnalyticsIds();
      
      expect(sessionId).toBe('test-uuid-1234-5678-90ab-cdef');
      expect(sessionStorage.setItem).toHaveBeenCalledWith('divee_session_id', sessionId);
    });

    test.skip('should reuse existing session ID from sessionStorage', () => {
      // Skipped: sessionStorage mock inside eval doesn't work properly
      // Test this in E2E tests where real storage is available
      const existingId = 'existing-session-id';
      localStorage.getItem.mockReturnValueOnce('visitor-id');
      sessionStorage.getItem.mockReturnValueOnce(existingId);
      
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      const { sessionId } = widget.getAnalyticsIds();
      
      expect(sessionId).toBe(existingId);
      expect(sessionStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('Debug Mode', () => {
    test.skip('should detect debug mode from URL parameter', () => {
      // Skipped: jsdom doesn't support window.location reassignment
      // This functionality is tested in E2E tests
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
    test('should use provided nonCacheBaseUrl', () => {
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget(mockConfig);
      expect(widget.config.nonCacheBaseUrl).toBe('https://api.test.com');
    });

    test('should use default nonCacheBaseUrl if not provided', () => {
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      
      const widget = new DiveeWidget({ projectId: 'test' });
      expect(widget.config.nonCacheBaseUrl).toBe('https://srv.divee.ai/functions/v1');
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

  describe('Visitor Token Cleanup (/conversations removal)', () => {
    // The /conversations endpoint and its visitor-token scheme were removed
    // (see docs/security/CONVERSATIONS_ENDPOINT_REMOVAL.md). Residual tokens
    // left in localStorage by prior widget versions must be purged on init.
    test('removes any residual divee_visitor_token from localStorage on getAnalyticsIds', () => {
      localStorage.setItem('divee_consent', 'granted');
      localStorage.setItem('divee_visitor_token', 'stale-token-from-prior-release');

      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);

      const widget = new DiveeWidget(mockConfig);
      widget.getAnalyticsIds();

      expect(localStorage.getItem('divee_visitor_token')).toBeNull();
      expect(widget.state.visitorToken).toBeUndefined();
    });
  });

  describe('Consent', () => {
    const loadWidget = () => {
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      return new DiveeWidget(mockConfig);
    };

    const denied = () => ({ storage: false, ads: false, source: 'banner', determined: true });

    test('initial consent is undetermined when nothing stored and no CMP', () => {
      const widget = loadWidget();
      expect(widget.state.consent.storage).toBe(false);
      expect(widget.state.consent.ads).toBe(false);
      expect(widget.state.consent.determined).toBe(false);
      expect(widget.state.consent.source).toBeNull();
    });

    test('initial consent restored from localStorage when previously granted', () => {
      localStorage.setItem('divee_consent', 'granted');
      const widget = loadWidget();
      expect(widget.state.consent.storage).toBe(true);
      expect(widget.state.consent.source).toBe('restored');
      expect(widget.state.consent.determined).toBe(true);
    });

    test('previously declined consent does NOT persist across page loads', () => {
      const widget = loadWidget();
      expect(widget.state.consent.determined).toBe(false);
    });

    test('storageSet writes to memory only when consent is undetermined', () => {
      const widget = loadWidget();
      widget.storageSet('divee_visitor_id', 'mem-id');
      expect(widget._memStore.divee_visitor_id).toBe('mem-id');
      expect(localStorage.getItem('divee_visitor_id')).toBeNull();
    });

    test('storageSet writes to memory only when consent is denied', () => {
      const widget = loadWidget();
      widget.state.consent = denied();
      widget.storageSet('divee_visitor_id', 'mem-id');
      expect(widget._memStore.divee_visitor_id).toBe('mem-id');
      expect(localStorage.getItem('divee_visitor_id')).toBeNull();
    });

    test('storageSet writes to localStorage when storage consent is granted', () => {
      localStorage.setItem('divee_consent', 'granted');
      const widget = loadWidget();
      widget.storageSet('divee_visitor_id', 'persisted-id');
      expect(localStorage.getItem('divee_visitor_id')).toBe('persisted-id');
      expect(widget._memStore.divee_visitor_id).toBe('persisted-id');
    });

    test('storageGet prefers memory over localStorage', () => {
      localStorage.setItem('divee_consent', 'granted');
      localStorage.setItem('divee_visitor_id', 'from-ls');
      const widget = loadWidget();
      widget._memStore.divee_visitor_id = 'from-mem';
      expect(widget.storageGet('divee_visitor_id')).toBe('from-mem');
    });

    test('storageGet ignores localStorage when storage consent not granted', () => {
      localStorage.setItem('divee_unrelated_key', 'leaked-value');
      const widget = loadWidget();
      expect(widget.storageGet('divee_unrelated_key')).toBeNull();
    });

    test('getAnalyticsIds persists newly-minted visitor ID when consent granted', () => {
      localStorage.setItem('divee_consent', 'granted');
      const widget = loadWidget();
      widget.getAnalyticsIds();
      expect(localStorage.getItem('divee_visitor_id')).toBe(widget.state.visitorId);
    });

    test('getAnalyticsIds keeps visitor ID in memory only when consent denied', () => {
      const widget = loadWidget();
      widget.state.consent = denied();
      widget.getAnalyticsIds();
      expect(widget.state.visitorId).toBeTruthy();
      expect(localStorage.getItem('divee_visitor_id')).toBeNull();
      expect(widget._memStore.divee_visitor_id).toBe(widget.state.visitorId);
    });

    test('maybeShowConsent is a no-op when ask_concent is false', () => {
      const widget = loadWidget();
      widget.state.serverConfig = { ask_concent: false };
      widget.elements.expandedView = document.createElement('div');
      widget.elements.expandedView.innerHTML = '<div class="divee-consent" style="display:none;"></div>';
      widget.maybeShowConsent();
      const consentEl = widget.elements.expandedView.querySelector('.divee-consent');
      expect(consentEl.style.display).toBe('none');
    });

    test('maybeShowConsent shows banner when ask_concent=true and undecided', () => {
      const widget = loadWidget();
      widget.state.serverConfig = { ask_concent: true };
      widget.elements.expandedView = document.createElement('div');
      widget.elements.expandedView.innerHTML = '<div class="divee-consent" style="display:none;"></div>';
      widget.maybeShowConsent();
      const consentEl = widget.elements.expandedView.querySelector('.divee-consent');
      expect(consentEl.style.display).toBe('flex');
    });

    test('maybeShowConsent does not reshow when already decided', () => {
      const widget = loadWidget();
      widget.state.serverConfig = { ask_concent: true };
      widget.state.consent = denied();
      widget.elements.expandedView = document.createElement('div');
      widget.elements.expandedView.innerHTML = '<div class="divee-consent" style="display:none;"></div>';
      widget.maybeShowConsent();
      const consentEl = widget.elements.expandedView.querySelector('.divee-consent');
      expect(consentEl.style.display).toBe('none');
    });

    test('maybeShowConsent does not show banner when CMP is detected', () => {
      const widget = loadWidget();
      widget._cmpAttached = true;
      widget.state.serverConfig = { ask_concent: true };
      widget.elements.expandedView = document.createElement('div');
      widget.elements.expandedView.innerHTML = '<div class="divee-consent" style="display:none;"></div>';
      widget.maybeShowConsent();
      const consentEl = widget.elements.expandedView.querySelector('.divee-consent');
      expect(consentEl.style.display).toBe('none');
    });

    test('handleConsent(true) persists consent and flushes memory store', () => {
      const widget = loadWidget();
      widget.elements.expandedView = document.createElement('div');
      widget.elements.expandedView.innerHTML = '<div class="divee-consent" style="display:flex;"></div>';
      widget.trackEvent = jest.fn();
      widget._memStore.divee_visitor_id = 'mem-id';

      widget.handleConsent(true);

      expect(widget.state.consent.storage).toBe(true);
      expect(widget.state.consent.ads).toBe(false); // banner never grants ads consent
      expect(widget.state.consent.analytics).toBe(true); // banner grants analytics
      expect(widget.state.consent.source).toBe('banner');
      expect(widget.state.consent.determined).toBe(true);
      expect(localStorage.getItem('divee_consent')).toBe('granted');
      expect(localStorage.getItem('divee_visitor_id')).toBe('mem-id');
      expect(widget.elements.expandedView.querySelector('.divee-consent').style.display).toBe('none');
      expect(widget.trackEvent).toHaveBeenCalledWith('consent_decision', { accepted: true });
    });

    test('handleConsent(false) keeps values in memory only', () => {
      const widget = loadWidget();
      widget.elements.expandedView = document.createElement('div');
      widget.elements.expandedView.innerHTML = '<div class="divee-consent" style="display:flex;"></div>';
      widget.trackEvent = jest.fn();
      widget._memStore.divee_visitor_id = 'mem-id';

      widget.handleConsent(false);

      expect(widget.state.consent.storage).toBe(false);
      expect(widget.state.consent.source).toBe('banner');
      expect(widget.state.consent.determined).toBe(true);
      expect(localStorage.getItem('divee_consent')).toBeNull();
      expect(localStorage.getItem('divee_visitor_id')).toBeNull();
      expect(widget._memStore.divee_visitor_id).toBe('mem-id');
      expect(widget.elements.expandedView.querySelector('.divee-consent').style.display).toBe('none');
      expect(widget.trackEvent).toHaveBeenCalledWith('consent_decision', { accepted: false });
    });

    describe('trackEvent gating on analytics consent', () => {
      const granted = () => ({ storage: true, ads: false, analytics: true, source: 'banner', determined: true });

      test('drops non-essential events when analytics consent is missing', () => {
        const widget = loadWidget();
        widget.state.visitorId = 'v1';
        widget.state.sessionId = 's1';
        widget.sendAnalyticsBatch = jest.fn();
        widget.recordSessionEvent = jest.fn();

        widget.trackEvent('widget_visible', { foo: 'bar' });
        widget.trackEvent('suggestions_fetched', { count: 3 });

        expect(widget.sendAnalyticsBatch).not.toHaveBeenCalled();
      });

      test('sends widget_loaded in aggregated form when analytics consent is missing', () => {
        const widget = loadWidget();
        widget.state.visitorId = 'v1';
        widget.state.sessionId = 's1';
        widget.sendAnalyticsBatch = jest.fn();
        widget.recordSessionEvent = jest.fn();

        widget.trackEvent('widget_loaded', { position: 'bottom-right' });

        expect(widget.sendAnalyticsBatch).toHaveBeenCalledTimes(1);
        const [batch] = widget.sendAnalyticsBatch.mock.calls[0];
        expect(batch).toHaveLength(1);
        expect(batch[0].visitor_id).toBeNull();
        expect(batch[0].session_id).toBeNull();
        expect(batch[0].article_url).toBeNull();
        expect(batch[0].event_type).toBe('widget_loaded');
        expect(batch[0].event_data).toEqual({ aggregated: true });
      });

      test('consent_decision aggregated payload retains the binary outcome', () => {
        const widget = loadWidget();
        widget.state.visitorId = 'v1';
        widget.state.sessionId = 's1';
        widget.sendAnalyticsBatch = jest.fn();
        widget.recordSessionEvent = jest.fn();

        widget.trackEvent('consent_decision', { accepted: false });

        expect(widget.sendAnalyticsBatch).toHaveBeenCalledTimes(1);
        const [batch] = widget.sendAnalyticsBatch.mock.calls[0];
        expect(batch[0].visitor_id).toBeNull();
        expect(batch[0].event_data).toEqual({ aggregated: true, accepted: false });
      });

      test('full event payload sent when analytics consent is granted', () => {
        const widget = loadWidget();
        widget.state.consent = granted();
        widget.state.visitorId = 'v1';
        widget.state.sessionId = 's1';
        widget.sendAnalyticsBatch = jest.fn();
        widget.recordSessionEvent = jest.fn();

        widget.trackEvent('widget_loaded', { position: 'bottom-right' });

        expect(widget.sendAnalyticsBatch).toHaveBeenCalledTimes(1);
        const [batch] = widget.sendAnalyticsBatch.mock.calls[0];
        expect(batch[0].visitor_id).toBe('v1');
        expect(batch[0].session_id).toBe('s1');
        expect(batch[0].event_type).toBe('widget_loaded');
        expect(batch[0].event_data).toEqual({ position: 'bottom-right' });
      });
    });

    test('after granting consent, subsequent storageSet writes to localStorage', () => {
      const widget = loadWidget();
      widget.elements.expandedView = document.createElement('div');
      widget.elements.expandedView.innerHTML = '<div class="divee-consent"></div>';
      widget.trackEvent = jest.fn();

      widget.storageSet('divee_visitor_id', 'id-1');
      expect(localStorage.getItem('divee_visitor_id')).toBeNull();

      widget.handleConsent(true);

      widget.storageSet('divee_visitor_id', 'id-2');
      expect(localStorage.getItem('divee_visitor_id')).toBe('id-2');
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
    test.skip('should cache extracted content', () => {
      // Skipped: Content extraction doesn't work properly in jsdom
      // Test this in E2E tests instead
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

  describe('PII redaction', () => {
    const loadWidget = () => {
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      return new DiveeWidget(mockConfig);
    };

    test('luhnCheck accepts a known-valid card number', () => {
      const widget = loadWidget();
      // Visa test number — passes Luhn
      expect(widget.luhnCheck('4111111111111111')).toBe(true);
      // MasterCard test number
      expect(widget.luhnCheck('5500000000000004')).toBe(true);
    });

    test('luhnCheck rejects invalid digit runs', () => {
      const widget = loadWidget();
      expect(widget.luhnCheck('4111111111111112')).toBe(false);
      expect(widget.luhnCheck('1234567890123456')).toBe(false);
      expect(widget.luhnCheck('abc')).toBe(false);
    });

    test('redactSensitivePatterns redacts emails', () => {
      const widget = loadWidget();
      const { text, hits } = widget.redactSensitivePatterns('contact me at jane.doe+test@example.co.uk for more');
      expect(text).toBe('contact me at [redacted] for more');
      expect(hits).toContain('email');
    });

    test('redactSensitivePatterns redacts SSNs', () => {
      const widget = loadWidget();
      const { text, hits } = widget.redactSensitivePatterns('SSN is 123-45-6789 ok?');
      expect(text).toBe('SSN is [redacted] ok?');
      expect(hits).toContain('ssn');
    });

    test('redactSensitivePatterns redacts Luhn-valid credit cards', () => {
      const widget = loadWidget();
      const { text, hits } = widget.redactSensitivePatterns('my card 4111 1111 1111 1111 thanks');
      expect(text).toContain('[redacted]');
      expect(text).not.toContain('4111');
      expect(hits).toContain('credit_card');
    });

    test('redactSensitivePatterns leaves non-Luhn 16-digit numbers alone', () => {
      const widget = loadWidget();
      const { text, hits } = widget.redactSensitivePatterns('order 1234567890123456 was delivered');
      expect(text).toContain('1234567890123456');
      expect(hits).not.toContain('credit_card');
    });

    test('redactSensitivePatterns redacts IBANs', () => {
      const widget = loadWidget();
      const { text, hits } = widget.redactSensitivePatterns('send to GB82WEST12345698765432 today');
      expect(text).toBe('send to [redacted] today');
      expect(hits).toContain('iban');
    });

    test('redactSensitivePatterns redacts precise GPS coordinates', () => {
      const widget = loadWidget();
      const { text, hits } = widget.redactSensitivePatterns('I am at 40.71280, -74.00601 right now');
      expect(text).toContain('[redacted]');
      expect(hits).toContain('coordinates');
    });

    test('redactSensitivePatterns leaves coarse coordinates alone', () => {
      const widget = loadWidget();
      const { text, hits } = widget.redactSensitivePatterns('NYC is around 40.7, -74.0');
      expect(text).toContain('40.7');
      expect(hits).not.toContain('coordinates');
    });

    test('redactSensitivePatterns redacts phone numbers', () => {
      const widget = loadWidget();
      const a = widget.redactSensitivePatterns('call (415) 555-0100 today');
      expect(a.text).toContain('[redacted]');
      expect(a.hits).toContain('phone');

      const b = widget.redactSensitivePatterns('international +44 20 7946 0958 number');
      expect(b.text).toContain('[redacted]');
      expect(b.hits).toContain('phone');
    });

    test('redactSensitivePatterns redacts multiple categories in one string', () => {
      const widget = loadWidget();
      const { text, hits } = widget.redactSensitivePatterns('email me at a@b.co or call 4155550100, my SSN is 123-45-6789');
      expect(text).not.toContain('a@b.co');
      expect(text).not.toContain('123-45-6789');
      expect(hits).toContain('email');
      expect(hits).toContain('ssn');
    });

    test('redactSensitivePatterns leaves clean text untouched', () => {
      const widget = loadWidget();
      const input = 'What is the difference between TCP and UDP?';
      const { text, hits } = widget.redactSensitivePatterns(input);
      expect(text).toBe(input);
      expect(hits).toEqual([]);
    });

    test('redactSensitivePatterns handles empty / non-string inputs', () => {
      const widget = loadWidget();
      expect(widget.redactSensitivePatterns('').hits).toEqual([]);
      expect(widget.redactSensitivePatterns(null).hits).toEqual([]);
      expect(widget.redactSensitivePatterns(undefined).hits).toEqual([]);
    });

    test('redactSensitivePatterns uses localized marker when translation provided', () => {
      const widget = loadWidget();
      widget.state.serverConfig = { translations: { redactedToken: '[הוסר]' } };
      const { text, hits } = widget.redactSensitivePatterns('email a@b.co and call (415) 555-0100');
      expect(text).not.toContain('[redacted]');
      expect(text).toContain('[הוסר]');
      expect(hits).toContain('email');
      expect(hits).toContain('phone');
    });

    test('redactSensitivePatterns falls back to [redacted] when translations are missing', () => {
      const widget = loadWidget();
      // No serverConfig set — fallback path
      const { text } = widget.redactSensitivePatterns('email a@b.co');
      expect(text).toBe('email [redacted]');
    });

    test('addSystemMessage renders a system-styled message bubble', () => {
      const widget = loadWidget();
      // Build minimal DOM the method expects
      widget.elements.expandedView = document.createElement('div');
      widget.elements.expandedView.innerHTML = '<div class="divee-chat"><div class="divee-messages"></div></div>';

      widget.addSystemMessage('We removed something that looked like personal info.');

      const messages = widget.elements.expandedView.querySelectorAll('.divee-message');
      expect(messages).toHaveLength(1);
      expect(messages[0].classList.contains('divee-message-system')).toBe(true);
      expect(messages[0].querySelector('.divee-message-content').textContent)
        .toBe('We removed something that looked like personal info.');
    });

    test('addSystemMessage does NOT push to state.messages (transient UI signal)', () => {
      const widget = loadWidget();
      widget.elements.expandedView = document.createElement('div');
      widget.elements.expandedView.innerHTML = '<div class="divee-chat"><div class="divee-messages"></div></div>';
      const before = widget.state.messages.length;

      widget.addSystemMessage('test notice');

      expect(widget.state.messages.length).toBe(before);
    });

    test('askQuestion emits a system notice when redactionHits is non-empty', async () => {
      const widget = loadWidget();
      widget.elements.expandedView = document.createElement('div');
      widget.elements.expandedView.innerHTML = '<div class="divee-chat"><div class="divee-messages"></div></div>';
      widget.state.serverConfig = { translations: { redactionNotice: 'Removed something private.' } };
      widget.streamResponse = jest.fn().mockResolvedValue();
      widget.trackEvent = jest.fn();

      await widget.askQuestion('clean question', 'custom', null, ['email']);

      const system = widget.elements.expandedView.querySelector('.divee-message-system');
      expect(system).not.toBeNull();
      expect(system.querySelector('.divee-message-content').textContent)
        .toBe('Removed something private.');
    });

    test('askQuestion does NOT emit a system notice when redactionHits is empty', async () => {
      const widget = loadWidget();
      widget.elements.expandedView = document.createElement('div');
      widget.elements.expandedView.innerHTML = '<div class="divee-chat"><div class="divee-messages"></div></div>';
      widget.streamResponse = jest.fn().mockResolvedValue();
      widget.trackEvent = jest.fn();

      await widget.askQuestion('clean question', 'custom', null, []);

      expect(widget.elements.expandedView.querySelector('.divee-message-system')).toBeNull();
    });
  });

  describe('stripUrlIdentifiers', () => {
    const loadWidget = () => {
      const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
      eval(widgetJs);
      return new DiveeWidget(mockConfig);
    };

    test('strips query string', () => {
      const widget = loadWidget();
      expect(widget.stripUrlIdentifiers('https://example.com/article?id=12&utm=foo'))
        .toBe('https://example.com/article');
    });

    test('strips hash fragment', () => {
      const widget = loadWidget();
      expect(widget.stripUrlIdentifiers('https://example.com/article#section-2'))
        .toBe('https://example.com/article');
    });

    test('strips both query and hash', () => {
      const widget = loadWidget();
      expect(widget.stripUrlIdentifiers('https://example.com/article?x=1#frag'))
        .toBe('https://example.com/article');
    });

    test('passes through clean URLs', () => {
      const widget = loadWidget();
      expect(widget.stripUrlIdentifiers('https://example.com/article'))
        .toBe('https://example.com/article');
    });

    test('handles invalid URLs without throwing', () => {
      const widget = loadWidget();
      expect(widget.stripUrlIdentifiers('not a url?with=params#frag'))
        .toBe('not a url');
    });

    test('passes through nullish values', () => {
      const widget = loadWidget();
      expect(widget.stripUrlIdentifiers(null)).toBeNull();
      expect(widget.stripUrlIdentifiers('')).toBe('');
    });
  });
});
