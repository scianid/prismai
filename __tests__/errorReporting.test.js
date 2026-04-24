/**
 * Error reporting tests
 * Covers the widget-side Sentry proxy reporter:
 *   - POST shape (endpoint, payload, keepalive)
 *   - dedupe by stack hash
 *   - per-page rate limit
 *   - `empty_article` phase fires when extracted content is too short
 */

const { describe, test, expect, beforeEach } = require('@jest/globals');
const fs = require('fs');

const widgetJs = fs.readFileSync('./src/widget.js', 'utf8');
const WIDGET_ERROR_URL = 'https://srv.divee.ai/functions/v1/widget-error';

// Swallows fetches to the config/analytics endpoints that run during init;
// returns a 204 for the widget-error endpoint so the reporter resolves cleanly.
function mockFetchAllowAll(overrides = {}) {
  fetch.mockImplementation((url) => {
    const u = String(url);
    if (u.includes('widget-error')) {
      return Promise.resolve({ ok: true, status: 204, text: () => Promise.resolve('') });
    }
    if (overrides.config && u.includes('/config')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(overrides.config),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

function getErrorCalls() {
  return fetch.mock.calls.filter((c) => String(c[0]).includes('widget-error'));
}

function parseErrorPayload(call) {
  return JSON.parse(call[1].body);
}

describe('widget error reporting', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    delete window.__diveeWidgetLoaded;
    delete window.DiveeWidget;
    delete window.DiveeSDK;
    fetch.mockClear();
  });

  describe('reportError()', () => {
    test('POSTs to widget-error endpoint with expected payload shape', () => {
      mockFetchAllowAll();
      eval(widgetJs);

      // Skip init side effects — we're testing the reporter in isolation.
      window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
      const widget = new window.DiveeWidget({ projectId: 'proj-abc' });

      fetch.mockClear();
      widget.reportError(new Error('Boom'), 'test_phase');

      const calls = getErrorCalls();
      expect(calls).toHaveLength(1);

      const [url, opts] = calls[0];
      expect(url).toBe(WIDGET_ERROR_URL);
      expect(opts.method).toBe('POST');
      expect(opts.keepalive).toBe(true);
      expect(opts.headers['Content-Type']).toBe('application/json');

      const body = parseErrorPayload(calls[0]);
      expect(body.message).toBe('Boom');
      expect(body.phase).toBe('test_phase');
      expect(body.project_id).toBe('proj-abc');
      expect(typeof body.build_version).toBe('string');
      expect(body.stack).toEqual(expect.any(String));
      expect(body.widget_url).toEqual(expect.any(String));
      expect(body.user_agent).toEqual(expect.any(String));
    });

    test('dedupes identical errors by stack hash', () => {
      mockFetchAllowAll();
      eval(widgetJs);
      window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
      const widget = new window.DiveeWidget({ projectId: 'p' });

      fetch.mockClear();
      // Same Error object (same stack) → same hash → one POST.
      const err = new Error('same');
      widget.reportError(err, 'phase_a');
      widget.reportError(err, 'phase_a');
      widget.reportError(err, 'phase_a');

      expect(getErrorCalls()).toHaveLength(1);
    });

    test('distinct errors are reported separately', () => {
      mockFetchAllowAll();
      eval(widgetJs);
      window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
      const widget = new window.DiveeWidget({ projectId: 'p' });

      fetch.mockClear();
      widget.reportError(new Error('first'), 'phase_a');
      widget.reportError(new Error('second'), 'phase_a');

      expect(getErrorCalls()).toHaveLength(2);
    });

    test('rate-limits to 5 reports per page lifecycle', () => {
      mockFetchAllowAll();
      eval(widgetJs);
      window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
      const widget = new window.DiveeWidget({ projectId: 'p' });

      fetch.mockClear();
      // 10 distinct errors — only the first 5 should go through.
      for (let i = 0; i < 10; i++) {
        widget.reportError(new Error(`err-${i}`), 'phase_a');
      }

      expect(getErrorCalls()).toHaveLength(5);
    });

    test('never throws when fetch rejects (fire-and-forget)', () => {
      fetch.mockImplementation(() => Promise.reject(new Error('network down')));
      eval(widgetJs);
      window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
      const widget = new window.DiveeWidget({ projectId: 'p' });

      expect(() => widget.reportError(new Error('x'), 'phase_a')).not.toThrow();
    });

    test('falls back to null project_id when config has none', () => {
      mockFetchAllowAll();
      eval(widgetJs);
      window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
      const widget = new window.DiveeWidget({});

      fetch.mockClear();
      widget.reportError(new Error('no proj'), 'phase_a');

      const body = parseErrorPayload(getErrorCalls()[0]);
      expect(body.project_id).toBeNull();
    });
  });

  describe('empty article triggers reportError with phase=empty_article', () => {
    async function flushMicrotasks() {
      // `init()` awaits loadServerConfig → resolving promises takes a few ticks.
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    test('reports when articleContent is empty string', async () => {
      mockFetchAllowAll({
        config: {
          enabled: true,
          widget_mode: 'article',
          display_mode: 'anchored',
          display_position: 'bottom',
          direction: 'ltr',
          language: 'en',
          highlight_color: ['#68E5FD', '#A389E0'],
          show_ad: false,
        },
      });
      eval(widgetJs);

      // Stub only what init touches in the article path, keeping the empty-
      // article guard itself unstubbed so we actually exercise it.
      window.DiveeWidget.prototype.initGoogleAds = jest.fn();
      window.DiveeWidget.prototype.trackEvent = jest.fn();
      window.DiveeWidget.prototype.getAnalyticsIds = jest.fn();
      window.DiveeWidget.prototype.extractArticleContent = jest.fn(function () {
        this.articleContent = '';
        return true; // articleFound — but content is empty
      });

      new window.DiveeWidget({ projectId: 'proj-empty' });
      await flushMicrotasks();

      const errorCalls = getErrorCalls();
      expect(errorCalls).toHaveLength(1);

      const body = parseErrorPayload(errorCalls[0]);
      expect(body.phase).toBe('empty_article');
      expect(body.project_id).toBe('proj-empty');
      expect(body.message).toContain('length=0');
    });

    test('reports length value when content is too short (not just 0)', async () => {
      mockFetchAllowAll({
        config: {
          enabled: true,
          widget_mode: 'article',
          display_mode: 'anchored',
          display_position: 'bottom',
          direction: 'ltr',
          language: 'en',
          highlight_color: ['#68E5FD', '#A389E0'],
          show_ad: false,
        },
      });
      eval(widgetJs);

      window.DiveeWidget.prototype.initGoogleAds = jest.fn();
      window.DiveeWidget.prototype.trackEvent = jest.fn();
      window.DiveeWidget.prototype.getAnalyticsIds = jest.fn();
      window.DiveeWidget.prototype.extractArticleContent = jest.fn(function () {
        this.articleContent = 'short'; // length 5, below the <10 threshold
        return true;
      });

      new window.DiveeWidget({ projectId: 'proj-short' });
      await flushMicrotasks();

      const errorCalls = getErrorCalls();
      expect(errorCalls).toHaveLength(1);
      const body = parseErrorPayload(errorCalls[0]);
      expect(body.phase).toBe('empty_article');
      expect(body.message).toContain('length=5');
    });

    test('does NOT report when article content is long enough', async () => {
      mockFetchAllowAll({
        config: {
          enabled: true,
          widget_mode: 'article',
          display_mode: 'anchored',
          display_position: 'bottom',
          direction: 'ltr',
          language: 'en',
          highlight_color: ['#68E5FD', '#A389E0'],
          show_ad: false,
        },
      });
      eval(widgetJs);

      window.DiveeWidget.prototype.initGoogleAds = jest.fn();
      window.DiveeWidget.prototype.trackEvent = jest.fn();
      window.DiveeWidget.prototype.getAnalyticsIds = jest.fn();
      // Skip DOM work — we only care that the length-check path doesn't fire.
      window.DiveeWidget.prototype.createWidget = jest.fn();
      window.DiveeWidget.prototype.attachEventListeners = jest.fn();
      window.DiveeWidget.prototype.setupVisibilityTracking = jest.fn();
      window.DiveeWidget.prototype.setupPageUnloadFlush = jest.fn();
      window.DiveeWidget.prototype.initSessionTracking = jest.fn();
      window.DiveeWidget.prototype.setupAttentionAnimation = jest.fn();
      window.DiveeWidget.prototype.fetchAndRenderArticleTags = jest.fn();
      window.DiveeWidget.prototype.extractArticleContent = jest.fn(function () {
        this.articleContent = 'x'.repeat(500); // plenty of content
        return true;
      });

      new window.DiveeWidget({ projectId: 'proj-ok' });
      await flushMicrotasks();

      expect(getErrorCalls()).toHaveLength(0);
    });
  });
});
