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

    test('suppresses reports once the page is unloading', () => {
      mockFetchAllowAll();
      eval(widgetJs);
      window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
      const widget = new window.DiveeWidget({ projectId: 'p' });

      fetch.mockClear();
      // Simulate navigation / tab close — any fetch rejections that arrive
      // after this are browser aborts, not bugs worth reporting.
      window.dispatchEvent(new Event('pagehide'));

      widget.reportError(new Error('during unload'), 'phase_a');
      expect(getErrorCalls()).toHaveLength(0);
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
      // jsdom defaults to pathname '/', which the widget treats as a root URL
      // and skips reporting for. Move to a non-root path to exercise the
      // report path.
      window.history.pushState({}, '', '/some-article');

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
      window.history.pushState({}, '', '/some-article');
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

    test('_isRootPath treats quirky slash-only paths as root', () => {
      // jsdom rejects pathnames like "//" via pushState, so assert the
      // helper directly instead of driving it through a navigation.
      mockFetchAllowAll();
      eval(widgetJs);
      window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
      const widget = new window.DiveeWidget({ projectId: 'p' });

      // Root-like paths — all should skip reporting.
      expect(widget._isRootPath('')).toBe(true);
      expect(widget._isRootPath('/')).toBe(true);
      expect(widget._isRootPath('//')).toBe(true);
      expect(widget._isRootPath('///')).toBe(true);

      // Real article paths — should NOT skip.
      expect(widget._isRootPath('/article')).toBe(false);
      expect(widget._isRootPath('/article/')).toBe(false);
      expect(widget._isRootPath('//article')).toBe(false);
      expect(widget._isRootPath('/a/b/c')).toBe(false);
    });

    test('does NOT report when page is the site root (path = "/")', async () => {
      window.history.pushState({}, '', '/');
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
        this.articleContent = '';
        return true;
      });

      new window.DiveeWidget({ projectId: 'proj-root' });
      await flushMicrotasks();

      // Root URL landing pages are expected to lack articles — don't spam Sentry.
      expect(getErrorCalls()).toHaveLength(0);
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

  describe('fetchServerConfig retry policy', () => {
    // Keep retries fast by collapsing setTimeout delays. The widget uses
    // setTimeout(resolve, 300ms/900ms) for backoff; firing callbacks
    // immediately preserves order without burning wall-clock time.
    let realSetTimeout;
    beforeEach(() => {
      realSetTimeout = global.setTimeout;
      global.setTimeout = (cb) => { cb(); return 0; };
    });
    afterEach(() => {
      global.setTimeout = realSetTimeout;
    });

    function countConfigCalls() {
      return fetch.mock.calls.filter((c) => String(c[0]).includes('/config')).length;
    }

    test('retries on network error (TypeError) and succeeds on the second try', async () => {
      const goodConfig = { enabled: true, widget_mode: 'article' };
      let configAttempt = 0;
      fetch.mockImplementation((url) => {
        const u = String(url);
        if (u.includes('widget-error')) {
          return Promise.resolve({ ok: true, status: 204 });
        }
        if (u.includes('/config')) {
          configAttempt++;
          if (configAttempt === 1) return Promise.reject(new TypeError('Failed to fetch'));
          return Promise.resolve({ ok: true, json: () => Promise.resolve(goodConfig) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      eval(widgetJs);
      window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
      const widget = new window.DiveeWidget({ projectId: 'p' });

      const result = await widget.fetchServerConfig('p');
      expect(result).toEqual(goodConfig);
      expect(countConfigCalls()).toBe(2);
      expect(getErrorCalls()).toHaveLength(0); // success, nothing reported
    });

    test('retries on 5xx and succeeds on the third try', async () => {
      const goodConfig = { enabled: true };
      let configAttempt = 0;
      fetch.mockImplementation((url) => {
        const u = String(url);
        if (u.includes('widget-error')) return Promise.resolve({ ok: true, status: 204 });
        if (u.includes('/config')) {
          configAttempt++;
          if (configAttempt < 3) {
            return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
          }
          return Promise.resolve({ ok: true, json: () => Promise.resolve(goodConfig) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      eval(widgetJs);
      window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
      const widget = new window.DiveeWidget({ projectId: 'p' });

      const result = await widget.fetchServerConfig('p');
      expect(result).toEqual(goodConfig);
      expect(countConfigCalls()).toBe(3);
    });

    test('does NOT retry on 4xx (single attempt)', async () => {
      fetch.mockImplementation((url) => {
        const u = String(url);
        if (u.includes('widget-error')) return Promise.resolve({ ok: true, status: 204 });
        if (u.includes('/config')) {
          return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      eval(widgetJs);
      window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
      const widget = new window.DiveeWidget({ projectId: 'p' });

      await expect(widget.fetchServerConfig('p')).rejects.toMatchObject({
        kind: 'client',
        status: 403,
      });
      expect(countConfigCalls()).toBe(1);
    });

    test('exhausts retries on persistent network failure', async () => {
      fetch.mockImplementation((url) => {
        const u = String(url);
        if (u.includes('widget-error')) return Promise.resolve({ ok: true, status: 204 });
        if (u.includes('/config')) return Promise.reject(new TypeError('Failed to fetch'));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      eval(widgetJs);
      window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
      const widget = new window.DiveeWidget({ projectId: 'p' });

      await expect(widget.fetchServerConfig('p')).rejects.toMatchObject({
        kind: 'network',
      });
      expect(countConfigCalls()).toBe(3); // MAX_ATTEMPTS
    });
  });

  describe('loadServerConfig phase tagging', () => {
    let realSetTimeout;
    beforeEach(() => {
      realSetTimeout = global.setTimeout;
      global.setTimeout = (cb) => { cb(); return 0; };
    });
    afterEach(() => {
      global.setTimeout = realSetTimeout;
    });

    test('tags Sentry report with config_load_network on persistent network error', async () => {
      fetch.mockImplementation((url) => {
        const u = String(url);
        if (u.includes('widget-error')) return Promise.resolve({ ok: true, status: 204 });
        if (u.includes('/config')) return Promise.reject(new TypeError('Failed to fetch'));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      eval(widgetJs);
      window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
      const widget = new window.DiveeWidget({ projectId: 'p-net' });

      await widget.loadServerConfig();

      const calls = getErrorCalls();
      expect(calls).toHaveLength(1);
      expect(parseErrorPayload(calls[0]).phase).toBe('config_load_network');
    });

    test('tags Sentry report with config_load_client on 4xx', async () => {
      fetch.mockImplementation((url) => {
        const u = String(url);
        if (u.includes('widget-error')) return Promise.resolve({ ok: true, status: 204 });
        if (u.includes('/config')) {
          return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      eval(widgetJs);
      window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
      const widget = new window.DiveeWidget({ projectId: 'p-403' });

      await widget.loadServerConfig();

      const calls = getErrorCalls();
      expect(calls).toHaveLength(1);
      expect(parseErrorPayload(calls[0]).phase).toBe('config_load_client');
    });

    test('fetchAndRenderArticleTags retries on network error then succeeds', async () => {
      let tagsAttempt = 0;
      fetch.mockImplementation((url) => {
        const u = String(url);
        if (u.includes('widget-error')) return Promise.resolve({ ok: true, status: 204 });
        if (u.includes('/articles/tags')) {
          tagsAttempt++;
          if (tagsAttempt === 1) return Promise.reject(new TypeError('Failed to fetch'));
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ tags: [] }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      eval(widgetJs);
      window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
      const widget = new window.DiveeWidget({ projectId: 'p-tags' });
      // Minimal state so getArticleUniqueId returns something non-null.
      widget.contentCache = { url: 'https://example.com/a' };

      await widget.fetchAndRenderArticleTags();

      expect(tagsAttempt).toBe(2); // retried once
      expect(getErrorCalls()).toHaveLength(0); // recovered, no report
    });

    test('fetchAndRenderArticleTags stays silent on 4xx (no retry, no report)', async () => {
      let tagsAttempt = 0;
      fetch.mockImplementation((url) => {
        const u = String(url);
        if (u.includes('widget-error')) return Promise.resolve({ ok: true, status: 204 });
        if (u.includes('/articles/tags')) {
          tagsAttempt++;
          return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      eval(widgetJs);
      window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
      const widget = new window.DiveeWidget({ projectId: 'p-tags' });
      widget.contentCache = { url: 'https://example.com/a' };

      await widget.fetchAndRenderArticleTags();

      expect(tagsAttempt).toBe(1); // 4xx is not retried
      // 404 / missing-tags is expected for articles without tags yet — silent.
      expect(getErrorCalls()).toHaveLength(0);
    });

    test('fetchAndRenderArticleTags tags Sentry with tags_fetch_network on persistent network error', async () => {
      fetch.mockImplementation((url) => {
        const u = String(url);
        if (u.includes('widget-error')) return Promise.resolve({ ok: true, status: 204 });
        if (u.includes('/articles/tags')) return Promise.reject(new TypeError('Failed to fetch'));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      eval(widgetJs);
      window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
      const widget = new window.DiveeWidget({ projectId: 'p-tags' });
      widget.contentCache = { url: 'https://example.com/a' };

      await widget.fetchAndRenderArticleTags();

      const calls = getErrorCalls();
      expect(calls).toHaveLength(1);
      expect(parseErrorPayload(calls[0]).phase).toBe('tags_fetch_network');
    });

    test('fetchAndRenderArticleTags tags Sentry with tags_fetch_server on persistent 5xx', async () => {
      fetch.mockImplementation((url) => {
        const u = String(url);
        if (u.includes('widget-error')) return Promise.resolve({ ok: true, status: 204 });
        if (u.includes('/articles/tags')) {
          return Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({}) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      eval(widgetJs);
      window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
      const widget = new window.DiveeWidget({ projectId: 'p-tags' });
      widget.contentCache = { url: 'https://example.com/a' };

      await widget.fetchAndRenderArticleTags();

      const calls = getErrorCalls();
      expect(calls).toHaveLength(1);
      expect(parseErrorPayload(calls[0]).phase).toBe('tags_fetch_server');
    });

    test('tags Sentry report with config_load_server on persistent 5xx', async () => {
      fetch.mockImplementation((url) => {
        const u = String(url);
        if (u.includes('widget-error')) return Promise.resolve({ ok: true, status: 204 });
        if (u.includes('/config')) {
          return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      eval(widgetJs);
      window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
      const widget = new window.DiveeWidget({ projectId: 'p-503' });

      await widget.loadServerConfig();

      const calls = getErrorCalls();
      expect(calls).toHaveLength(1);
      expect(parseErrorPayload(calls[0]).phase).toBe('config_load_server');
    });
  });
});
