/**
 * Payload-size caps in DiveeWidget.fetchSuggestions()
 *
 * Server-side `enforceContentLength` rejects bodies >256KB and
 * `sanitizeContent` truncates content to MAX_CONTENT_LENGTH (200000)
 * and title to MAX_TITLE_LENGTH (1000). The widget applies the same
 * caps client-side so we never waste bandwidth / hit the 413 path on
 * verbose pages. These tests guard those caps.
 */

const { describe, test, expect, beforeEach } = require('@jest/globals');
const fs = require('fs');

const widgetJs = fs.readFileSync('./src/widget.js', 'utf8');

const MAX_CONTENT = 200000;
const MAX_TITLE = 1000;

function loadWidget(config = {}) {
  delete window.__diveeWidgetLoaded;
  eval(widgetJs);
  return new DiveeWidget({
    projectId: 'test-project-123',
    nonCacheBaseUrl: 'https://api.test.com',
    ...config,
  });
}

// fetchSuggestions tries the CDN-cached GET first, then falls back to the
// POST that ingests + generates. These tests target the POST payload, so we
// stub the cached GET as a 404 (cache miss) and the POST as the success.
function mockSuggestionsResponse(suggestions = []) {
  fetch.mockResolvedValueOnce({
    ok: false,
    status: 404,
    json: async () => ({ suggestions: [] }),
  });
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ suggestions }),
  });
}

function postCall() {
  // The POST is the second fetch call (after the cached GET miss). Use the
  // last call rather than [1] so this also works for tests that don't go
  // through mockSuggestionsResponse and only mock one call.
  return fetch.mock.calls[fetch.mock.calls.length - 1];
}

function lastFetchBody() {
  return JSON.parse(postCall()[1].body);
}

describe('fetchSuggestions — payload caps', () => {
  let widget;

  beforeEach(() => {
    document.body.innerHTML = '';
    widget = loadWidget();
    widget.contentCache = {
      content: 'short content',
      title: 'short title',
      url: 'https://example.com/article',
      image_url: null,
      og_image: null,
      extracted: true,
      articleFound: true,
    };
    widget.state = widget.state || {};
    widget.state.visitorId = 'visitor-1';
    widget.state.sessionId = 'session-1';
  });

  test('sends untruncated content when under the cap', async () => {
    mockSuggestionsResponse();
    await widget.fetchSuggestions();

    const body = lastFetchBody();
    expect(body.content).toBe('short content');
    expect(body.title).toBe('short title');
  });

  test('truncates content to 200000 chars', async () => {
    widget.contentCache.content = 'x'.repeat(MAX_CONTENT + 50000);
    mockSuggestionsResponse();

    await widget.fetchSuggestions();

    const body = lastFetchBody();
    expect(body.content.length).toBe(MAX_CONTENT);
    expect(body.content).toBe('x'.repeat(MAX_CONTENT));
  });

  test('truncates title to 1000 chars', async () => {
    widget.contentCache.title = 'T'.repeat(MAX_TITLE + 500);
    mockSuggestionsResponse();

    await widget.fetchSuggestions();

    const body = lastFetchBody();
    expect(body.title.length).toBe(MAX_TITLE);
    expect(body.title).toBe('T'.repeat(MAX_TITLE));
  });

  test('keeps request body under server 256KB limit even at max content', async () => {
    // MAX_CONTENT is 200KB; JSON envelope + other fields must stay under 256KB.
    widget.contentCache.content = 'y'.repeat(MAX_CONTENT);
    widget.contentCache.title = 'T'.repeat(MAX_TITLE);
    widget.contentCache.url = 'https://example.com/' + 'a'.repeat(500);
    mockSuggestionsResponse();

    await widget.fetchSuggestions();

    const call = fetch.mock.calls[fetch.mock.calls.length - 1];
    const bodyBytes = new TextEncoder().encode(call[1].body).length;
    expect(bodyBytes).toBeLessThan(262144); // 256KB — server `enforceContentLength` cap
  });

  test('handles null content/title without throwing', async () => {
    widget.contentCache.content = null;
    widget.contentCache.title = null;
    mockSuggestionsResponse();

    await widget.fetchSuggestions();

    const body = lastFetchBody();
    expect(body.content).toBe('');
    expect(body.title).toBe('');
  });

  test('POSTs to /suggestions on the configured base URL', async () => {
    mockSuggestionsResponse();

    await widget.fetchSuggestions();

    const call = fetch.mock.calls[fetch.mock.calls.length - 1];
    expect(call[0]).toBe('https://api.test.com/suggestions');
    expect(call[1].method).toBe('POST');
    expect(call[1].headers['Content-Type']).toBe('application/json');
  });

  test('returns [] and does not throw when fetch rejects', async () => {
    // Two rejections: the cached GET, then the POST fallback.
    fetch.mockRejectedValueOnce(new Error('cdn down'));
    fetch.mockRejectedValueOnce(new Error('network down'));
    const result = await widget.fetchSuggestions();
    expect(result).toEqual([]);
  });
});
