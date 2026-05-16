/**
 * Sponsored-ad (Teads in-chat) tests for src/widget.js
 *
 * Covers the widget-side ad pipeline:
 *   - fetchSponsoredAds() — payload shape, renderable-ad filter, dedupe
 *   - showNextSponsoredAd() — batch queue: one ad per reply, refetch on empty
 *   - renderSponsoredMessage() — DOM card, image/no-image variants, link safety
 *   - fireAdPixel() — Teads macro substitution + non-string guard
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const fs = require('fs');

const widgetJs = fs.readFileSync('./src/widget.js', 'utf8');

function makeWidget() {
  delete window.__diveeWidgetLoaded;
  eval(widgetJs); // eslint-disable-line no-eval
  const widget = new DiveeWidget({ // eslint-disable-line no-undef
    projectId: 'test-project',
    nonCacheBaseUrl: 'https://api.test.com',
  });
  widget.state.serverConfig = {
    show_ad: false,
    ad_tag_id: null,
    client_name: 'Test',
    icon_url: '',
    language_code: 'en',
    experimental: {},
  };
  widget.createWidget();
  widget.contentCache = {
    url: 'https://example.com/article',
    title: 'Test Article',
    content: 'body',
    image_url: null,
    og_image: null,
  };
  widget.state.visitorId = 'visitor-1';
  widget.state.conversationId = 'conv-1';
  widget.state.messages = [
    { id: 'm1', role: 'user', content: 'hello' },
    { id: 'm2', role: 'assistant', content: 'hi there' },
  ];
  return widget;
}

function sponsoredAd(overrides = {}) {
  return {
    position: 0,
    url: 'https://paid.example/redir?p=1',
    thumbnail: 'https://img.example/1.jpg',
    source: 'Tips and Tricks',
    headline: 'A sponsored headline',
    description: 'A sponsored description',
    cta: 'Read More',
    trackers: { reportServed: null, pixels: [], onViewed: [] },
    ...overrides,
  };
}

function mockAdsResponse(ads) {
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ads }) });
}

describe('fetchSponsoredAds()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('POSTs the expected payload to /chat-ads', async () => {
    const widget = makeWidget();
    mockAdsResponse([sponsoredAd()]);
    await widget.fetchSponsoredAds();

    const [url, init] = fetch.mock.calls[fetch.mock.calls.length - 1];
    expect(url).toBe('https://api.test.com/chat-ads');
    const body = JSON.parse(init.body);
    expect(body.projectId).toBe('test-project');
    expect(body.url).toBe('https://example.com/article');
    expect(body.title).toBe('Test Article');
    expect(body.lang).toBe('en');
    expect(body.visitor_id).toBe('visitor-1');
    expect(body.conversationId).toBe('conv-1');
    expect(body.messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ]);
  });

  test('drops ads missing a headline or url', async () => {
    const widget = makeWidget();
    mockAdsResponse([
      sponsoredAd({ url: 'https://a.example/1' }),
      sponsoredAd({ headline: null, url: 'https://a.example/2' }),
      sponsoredAd({ url: null }),
    ]);
    const ads = await widget.fetchSponsoredAds();
    expect(ads).toHaveLength(1);
    expect(ads[0].url).toBe('https://a.example/1');
  });

  test('dedupes ads already shown in a previous fetch', async () => {
    const widget = makeWidget();
    mockAdsResponse([
      sponsoredAd({ url: 'https://a.example/1' }),
      sponsoredAd({ url: 'https://a.example/2' }),
    ]);
    const first = await widget.fetchSponsoredAds();
    expect(first.map((a) => a.url)).toEqual([
      'https://a.example/1',
      'https://a.example/2',
    ]);

    // Second fetch returns one repeat + one new ad.
    mockAdsResponse([
      sponsoredAd({ url: 'https://a.example/2' }),
      sponsoredAd({ url: 'https://a.example/3' }),
    ]);
    const second = await widget.fetchSponsoredAds();
    expect(second.map((a) => a.url)).toEqual(['https://a.example/3']);
  });

  test('returns [] when the endpoint responds non-OK', async () => {
    const widget = makeWidget();
    fetch.mockResolvedValueOnce({ ok: false, status: 403 });
    const ads = await widget.fetchSponsoredAds();
    expect(ads).toEqual([]);
  });
});

describe('showNextSponsoredAd()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('fetches a batch, shows one ad, buffers the rest', async () => {
    const widget = makeWidget();
    const batch = [
      sponsoredAd({ url: 'https://a/1' }),
      sponsoredAd({ url: 'https://a/2' }),
      sponsoredAd({ url: 'https://a/3' }),
    ];
    const firstAd = batch[0];
    widget.fetchSponsoredAds = jest.fn().mockResolvedValue(batch);
    widget.renderSponsoredMessage = jest.fn();

    await widget.showNextSponsoredAd();

    expect(widget.fetchSponsoredAds).toHaveBeenCalledTimes(1);
    expect(widget.renderSponsoredMessage).toHaveBeenCalledTimes(1);
    expect(widget.renderSponsoredMessage).toHaveBeenLastCalledWith(firstAd);
    expect(widget.state.sponsoredQueue).toHaveLength(2);
  });

  test('draws from the buffer without refetching until it is empty', async () => {
    const widget = makeWidget();
    const batch = [
      sponsoredAd({ url: 'https://a/1' }),
      sponsoredAd({ url: 'https://a/2' }),
      sponsoredAd({ url: 'https://a/3' }),
    ];
    widget.fetchSponsoredAds = jest.fn()
      .mockResolvedValueOnce(batch)
      .mockResolvedValueOnce([sponsoredAd({ url: 'https://a/4' })]);
    widget.renderSponsoredMessage = jest.fn();

    // Replies 1-3 consume the buffered batch — one fetch only.
    await widget.showNextSponsoredAd();
    await widget.showNextSponsoredAd();
    await widget.showNextSponsoredAd();
    expect(widget.fetchSponsoredAds).toHaveBeenCalledTimes(1);
    expect(widget.renderSponsoredMessage).toHaveBeenCalledTimes(3);

    // Reply 4 — buffer empty — triggers a refetch.
    await widget.showNextSponsoredAd();
    expect(widget.fetchSponsoredAds).toHaveBeenCalledTimes(2);
    expect(widget.renderSponsoredMessage).toHaveBeenCalledTimes(4);
  });

  test('renders nothing when the fetch yields no ads', async () => {
    const widget = makeWidget();
    widget.fetchSponsoredAds = jest.fn().mockResolvedValue([]);
    widget.renderSponsoredMessage = jest.fn();
    await widget.showNextSponsoredAd();
    expect(widget.renderSponsoredMessage).not.toHaveBeenCalled();
  });
});

describe('renderSponsoredMessage()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('renders a sponsored card with headline, image, source and CTA', () => {
    const widget = makeWidget();
    widget.renderSponsoredMessage(sponsoredAd());

    const card = widget.elements.expandedView.querySelector('.divee-message-sponsored');
    expect(card).not.toBeNull();
    expect(card.querySelector('.divee-sponsored-headline').textContent)
      .toBe('A sponsored headline');
    expect(card.querySelector('.divee-sponsored-desc').textContent)
      .toBe('A sponsored description');
    expect(card.querySelector('.divee-sponsored-source-name').textContent)
      .toBe('Tips and Tricks');
    expect(card.querySelector('.divee-sponsored-cta').textContent)
      .toContain('Read More');

    const img = card.querySelector('.divee-sponsored-thumb');
    expect(img.getAttribute('src')).toBe('https://img.example/1.jpg');

    const link = card.querySelector('a.divee-sponsored-link');
    expect(link.getAttribute('href')).toBe('https://paid.example/redir?p=1');
    expect(link.getAttribute('rel')).toContain('sponsored');
  });

  test('falls back to a text label when the ad has no image', () => {
    const widget = makeWidget();
    widget.renderSponsoredMessage(sponsoredAd({ thumbnail: null }));
    const card = widget.elements.expandedView.querySelector('.divee-message-sponsored');
    expect(card.querySelector('.divee-sponsored-media')).toBeNull();
    expect(card.querySelector('.divee-sponsored-label')).not.toBeNull();
  });

  test('does not render a clickable link for a non-http url', () => {
    const widget = makeWidget();
    widget.renderSponsoredMessage(sponsoredAd({ url: 'javascript:alert(1)' }));
    const card = widget.elements.expandedView.querySelector('.divee-message-sponsored');
    expect(card.querySelector('a.divee-sponsored-link')).toBeNull();
    expect(card.querySelector('div.divee-sponsored-link')).not.toBeNull();
  });

  test('fires impression + viewability pixels via fireAdPixel', () => {
    const widget = makeWidget();
    const fired = [];
    widget.fireAdPixel = jest.fn((u) => fired.push(u));
    widget.renderSponsoredMessage(sponsoredAd({
      trackers: {
        reportServed: 'https://t.example/served',
        pixels: ['https://t.example/imp'],
        onViewed: ['https://t.example/view'],
      },
    }));
    // reportServed + impression pixels fire on render (viewability waits for
    // the IntersectionObserver).
    expect(fired).toContain('https://t.example/served');
    expect(fired).toContain('https://t.example/imp');
  });
});

describe('fireAdPixel()', () => {
  let OriginalImage;
  let firedSrc;

  beforeEach(() => {
    firedSrc = [];
    OriginalImage = global.Image;
    global.Image = class {
      set src(v) { firedSrc.push(v); }
    };
  });

  afterEach(() => {
    global.Image = OriginalImage;
  });

  test('substitutes Teads macros with 0', () => {
    const widget = makeWidget();
    widget.fireAdPixel('https://t.example/win?amtw=${AUCTION_MIN_TO_WIN}');
    expect(firedSrc).toEqual(['https://t.example/win?amtw=0']);
  });

  test('ignores empty or non-string input', () => {
    const widget = makeWidget();
    widget.fireAdPixel('');
    widget.fireAdPixel(null);
    widget.fireAdPixel(undefined);
    widget.fireAdPixel(42);
    expect(firedSrc).toEqual([]);
  });
});
