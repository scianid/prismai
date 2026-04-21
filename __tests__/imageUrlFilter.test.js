/**
 * Image URL filtering in extractArticleContent
 *
 * Guards against: oversized `data:` URIs (ex: base64 inline images) and
 * abnormally long URLs being shipped in `metadata.image_url`/`og_image`
 * to /suggestions and /chat, which would blow past the body-size cap.
 */

const { describe, test, expect, beforeEach } = require('@jest/globals');
const fs = require('fs');

const widgetJs = fs.readFileSync('./src/widget.js', 'utf8');

function loadWidget(config = {}) {
  delete window.__diveeWidgetLoaded;
  eval(widgetJs);
  return new DiveeWidget({
    projectId: 'test-project-123',
    nonCacheBaseUrl: 'https://api.test.com',
    ...config,
  });
}

describe('extractArticleContent — image URL filtering', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    delete window.diveeArticle;
  });

  describe('window.diveeArticle.image', () => {
    test('preserves absolute http(s) URLs', () => {
      window.diveeArticle = {
        title: 'T',
        content: 'C',
        image: 'https://cdn.example.com/img.jpg',
      };
      const widget = loadWidget();
      widget.extractArticleContent();
      expect(widget.contentCache.image_url).toBe('https://cdn.example.com/img.jpg');
    });

    test('rejects data: URIs', () => {
      window.diveeArticle = {
        title: 'T',
        content: 'C',
        image: 'data:image/jpeg;base64,' + 'A'.repeat(5000),
      };
      const widget = loadWidget();
      widget.extractArticleContent();
      expect(widget.contentCache.image_url).toBeNull();
    });

    test('rejects URLs longer than 2048 chars', () => {
      const longPath = 'a'.repeat(2050);
      window.diveeArticle = {
        title: 'T',
        content: 'C',
        image: `https://cdn.example.com/${longPath}.jpg`,
      };
      const widget = loadWidget();
      widget.extractArticleContent();
      expect(widget.contentCache.image_url).toBeNull();
    });

    test('rejects relative paths', () => {
      window.diveeArticle = {
        title: 'T',
        content: 'C',
        image: '/static/img.jpg',
      };
      const widget = loadWidget();
      widget.extractArticleContent();
      expect(widget.contentCache.image_url).toBeNull();
    });

    test('rejects javascript: scheme', () => {
      window.diveeArticle = {
        title: 'T',
        content: 'C',
        image: 'javascript:alert(1)',
      };
      const widget = loadWidget();
      widget.extractArticleContent();
      expect(widget.contentCache.image_url).toBeNull();
    });

    test('handles null image without throwing', () => {
      window.diveeArticle = { title: 'T', content: 'C', image: null };
      const widget = loadWidget();
      widget.extractArticleContent();
      expect(widget.contentCache.image_url).toBeNull();
    });

    test('accepts URL at exactly 2048 chars', () => {
      const prefix = 'https://e.com/';
      const padding = 'a'.repeat(2048 - prefix.length);
      const url = prefix + padding;
      expect(url.length).toBe(2048);
      window.diveeArticle = { title: 'T', content: 'C', image: url };
      const widget = loadWidget();
      widget.extractArticleContent();
      expect(widget.contentCache.image_url).toBe(url);
    });
  });

  describe('og:image / twitter:image meta tags', () => {
    test('preserves http(s) og:image', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('property', 'og:image');
      meta.setAttribute('content', 'https://cdn.example.com/og.jpg');
      document.head.appendChild(meta);

      const widget = loadWidget();
      widget.extractArticleContent();
      expect(widget.contentCache.og_image).toBe('https://cdn.example.com/og.jpg');
    });

    test('rejects data: URI og:image', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('property', 'og:image');
      meta.setAttribute('content', 'data:image/png;base64,' + 'X'.repeat(10000));
      document.head.appendChild(meta);

      const widget = loadWidget();
      widget.extractArticleContent();
      expect(widget.contentCache.og_image).toBeNull();
    });

    test('falls through to twitter:image when og:image absent', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'twitter:image');
      meta.setAttribute('content', 'https://cdn.example.com/tw.jpg');
      document.head.appendChild(meta);

      const widget = loadWidget();
      widget.extractArticleContent();
      expect(widget.contentCache.og_image).toBe('https://cdn.example.com/tw.jpg');
    });

    test('rejects twitter:image data URI', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'twitter:image');
      meta.setAttribute('content', 'data:image/png;base64,ZZZ');
      document.head.appendChild(meta);

      const widget = loadWidget();
      widget.extractArticleContent();
      expect(widget.contentCache.og_image).toBeNull();
    });
  });

  describe('<article img> extraction', () => {
    test('rejects data: URI img.src', () => {
      document.body.innerHTML = `
        <article>
          <img src="data:image/jpeg;base64,AAAA">
          <p>body</p>
        </article>
      `;
      const widget = loadWidget();
      widget.extractArticleContent();
      expect(widget.contentCache.image_url).toBeNull();
    });

    test('preserves http(s) img.src', () => {
      document.body.innerHTML = `
        <article>
          <img src="https://cdn.example.com/article.jpg">
          <p>body</p>
        </article>
      `;
      const widget = loadWidget();
      widget.extractArticleContent();
      expect(widget.contentCache.image_url).toBe('https://cdn.example.com/article.jpg');
    });
  });
});
