/**
 * Tests for the article + container selector fallback walk.
 * Covers _pickArticleSelector and _pickContainerSelector — the pure DOM
 * lookup methods extracted from widget.js init() so they can be exercised
 * without spinning up the whole widget lifecycle.
 */

const { describe, test, expect, beforeEach, beforeAll } = require('@jest/globals');

beforeAll(() => {
  // content.js defines the global getContent / getContentTitle / getContentUrl
  // helpers that widget.js consults. We need these in scope for the article
  // walk to take the "real" content path.
  const contentJs = require('fs').readFileSync('./src/content.js', 'utf8');
  // eslint-disable-next-line no-eval
  eval.call(global, contentJs + '; global.getContent = getContent; global.getContentTitle = getContentTitle; global.getContentUrl = getContentUrl;');

  const widgetJs = require('fs').readFileSync('./src/widget.js', 'utf8');
  // eslint-disable-next-line no-eval
  eval.call(global, widgetJs);
});

beforeEach(() => {
  document.body.innerHTML = '';
  delete window.__diveeWidgetLoaded;
});

function makeWidget() {
  // DiveeWidget calls fetch() during init, but _pickArticleSelector and
  // _pickContainerSelector are pure DOM lookups, so we never invoke init().
  // Construct directly with the minimal config the methods touch.
  // eslint-disable-next-line no-undef
  return new DiveeWidget({
    projectId: 'test-project-id',
    nonCacheBaseUrl: 'https://api.test.com',
  });
}

// content.js requires >= 3 <p> tags before it trusts paragraph extraction.
// Each "rich" article container needs at least three to be picked.
function richArticle() {
  const para = 'This is a paragraph with enough words to clear the twenty-character minimum filter.';
  return `<p>${para}</p><p>${para}</p><p>${para}</p>`;
}

describe('_pickArticleSelector', () => {
  test('returns null when given no selectors', () => {
    const w = makeWidget();
    expect(w._pickArticleSelector([])).toBeNull();
    expect(w._pickArticleSelector(null)).toBeNull();
    expect(w._pickArticleSelector(undefined)).toBeNull();
  });

  test('skips non-string and empty entries', () => {
    document.body.innerHTML = `<div class="real">${richArticle()}</div>`;
    const w = makeWidget();
    const result = w._pickArticleSelector([null, '', '   ', 42, '.real']);
    expect(result).not.toBeNull();
    expect(result.selectorUsed).toBe('.real');
  });

  test('picks primary when it has content', () => {
    document.body.innerHTML = `
      <div class="primary">${richArticle()}</div>
      <div class="fallback">${richArticle()}</div>
    `;
    const w = makeWidget();
    const result = w._pickArticleSelector(['.primary', '.fallback']);
    expect(result.selectorUsed).toBe('.primary');
    expect(result.element).toBe(document.querySelector('.primary'));
    expect(result.content.length).toBeGreaterThanOrEqual(10);
  });

  test('falls back when primary element is missing', () => {
    document.body.innerHTML = `<div class="fallback">${richArticle()}</div>`;
    const w = makeWidget();
    const result = w._pickArticleSelector(['.does-not-exist', '.fallback']);
    expect(result.selectorUsed).toBe('.fallback');
  });

  test('falls back when primary content is too short', () => {
    document.body.innerHTML = `
      <div class="primary"><p>tiny</p></div>
      <div class="fallback">${richArticle()}</div>
    `;
    const w = makeWidget();
    const result = w._pickArticleSelector(['.primary', '.fallback']);
    expect(result.selectorUsed).toBe('.fallback');
  });

  test('walks multiple fallbacks in order', () => {
    document.body.innerHTML = `
      <div class="primary"><p>tiny</p></div>
      <div class="second"><p>also short</p></div>
      <div class="third">${richArticle()}</div>
    `;
    const w = makeWidget();
    const result = w._pickArticleSelector(['.primary', '.missing', '.second', '.third']);
    expect(result.selectorUsed).toBe('.third');
  });

  test('returns null if every selector fails', () => {
    document.body.innerHTML = `
      <div class="primary"><p>tiny</p></div>
      <div class="fallback"><p>nope</p></div>
    `;
    const w = makeWidget();
    expect(w._pickArticleSelector(['.primary', '.fallback', '.missing'])).toBeNull();
  });
});

describe('_pickContainerSelector', () => {
  test('returns null with no selectors', () => {
    const w = makeWidget();
    expect(w._pickContainerSelector([])).toBeNull();
    expect(w._pickContainerSelector(undefined)).toBeNull();
  });

  test('returns first matching element', () => {
    document.body.innerHTML = `
      <aside class="rail"></aside>
      <div class="alt"></div>
    `;
    const w = makeWidget();
    expect(w._pickContainerSelector(['aside.rail', '.alt'])).toBe(
      document.querySelector('aside.rail'),
    );
  });

  test('walks fallbacks when primary is missing', () => {
    document.body.innerHTML = `<div class="alt"></div>`;
    const w = makeWidget();
    expect(w._pickContainerSelector(['aside.rail', '.alt'])).toBe(
      document.querySelector('.alt'),
    );
  });

  test('returns null if nothing matches', () => {
    document.body.innerHTML = `<div></div>`;
    const w = makeWidget();
    expect(w._pickContainerSelector(['#missing', '.also-missing'])).toBeNull();
  });

  test('does NOT apply a content-empty filter (an empty container is valid)', () => {
    document.body.innerHTML = `<aside class="empty"></aside>`;
    const w = makeWidget();
    const el = w._pickContainerSelector(['aside.empty']);
    expect(el).not.toBeNull();
    expect(el.textContent).toBe('');
  });
});
