/**
 * White Label Feature Unit Tests
 *
 * Tests that the widget conditionally renders/hides "powered by divee.ai"
 * branding based on the white_label flag in server config.
 *
 * Scenarios:
 *  - white_label: false  → branding visible in collapsed + expanded views
 *  - white_label: true   → branding absent in collapsed + expanded views
 *  - white_label absent  → defaults to false (branding visible)
 */

const { describe, test, expect, beforeEach } = require('@jest/globals');
const fs = require('fs');

const widgetJs = fs.readFileSync('./src/widget.js', 'utf8');

function makeWidget(serverConfig) {
  delete window.__diveeWidgetLoaded;
  eval(widgetJs); // eslint-disable-line no-eval
  const widget = new DiveeWidget({ projectId: 'test-project' }); // eslint-disable-line no-undef
  widget.state.serverConfig = serverConfig;
  return widget;
}

function baseConfig(overrides = {}) {
  return {
    direction: 'ltr',
    language: 'en',
    icon_url: 'https://example.com/icon.png',
    client_name: 'Test Site',
    client_description: 'Test',
    highlight_color: ['#68E5FD', '#A389E0'],
    show_ad: false,
    white_label: false,
    input_text_placeholders: ['Ask anything...'],
    ...overrides,
  };
}

describe('White Label — default config', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete window.__diveeWidgetLoaded;
  });

  test('getDefaultConfig() includes white_label: false', () => {
    eval(widgetJs); // eslint-disable-line no-eval
    const widget = new DiveeWidget({ projectId: 'test' }); // eslint-disable-line no-undef
    const defaults = widget.getDefaultConfig();
    expect(defaults).toHaveProperty('white_label', false);
  });
});

describe('White Label — collapsed view (default/anchored mode)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete window.__diveeWidgetLoaded;
  });

  test('white_label OFF → "powered by divee.ai" is in collapsed HTML', () => {
    const widget = makeWidget(baseConfig({ white_label: false }));
    const view = widget.createCollapsedView();

    // The pill bolds the brand via <strong>, so check the text content
    // (which collapses tags) rather than raw HTML.
    expect(view.querySelector('.divee-powered-by')).not.toBeNull();
    expect(view.querySelector('.divee-powered-by').textContent).toContain('powered by divee.ai');
  });

  test('white_label ON → "powered by divee.ai" is NOT in collapsed HTML', () => {
    const widget = makeWidget(baseConfig({ white_label: true }));
    const view = widget.createCollapsedView();

    expect(view.textContent).not.toContain('powered by divee.ai');
    expect(view.querySelector('.divee-powered-by')).toBeNull();
  });

  test('white_label absent in config → branding shown (defaults to false)', () => {
    const config = baseConfig();
    delete config.white_label;
    const widget = makeWidget(config);
    const view = widget.createCollapsedView();

    expect(view.querySelector('.divee-powered-by')).not.toBeNull();
  });
});

describe('White Label — collapsed view (cubic mode)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete window.__diveeWidgetLoaded;
  });

  test('white_label OFF → branding in cubic collapsed view', () => {
    const widget = makeWidget(baseConfig({ white_label: false }));
    widget.config.displayMode = 'cubic';
    const view = widget.createCollapsedView();

    expect(view.querySelector('.divee-powered-by')).not.toBeNull();
  });

  test('white_label ON → no branding in cubic collapsed view', () => {
    const widget = makeWidget(baseConfig({ white_label: true }));
    widget.config.displayMode = 'cubic';
    const view = widget.createCollapsedView();

    expect(view.querySelector('.divee-powered-by')).toBeNull();
  });
});

describe('White Label — expanded view', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete window.__diveeWidgetLoaded;
  });

  test('white_label OFF → "powered by divee.ai" is in expanded header', () => {
    const widget = makeWidget(baseConfig({ white_label: false }));
    const view = widget.createExpandedView();

    const poweredBy = view.querySelector('.divee-header .divee-powered-by');
    expect(poweredBy).not.toBeNull();
    expect(poweredBy.textContent).toContain('powered by divee.ai');
    expect(poweredBy.getAttribute('href')).toBe('https://www.divee.ai');
  });

  test('white_label ON → no "powered by" link in expanded header', () => {
    const widget = makeWidget(baseConfig({ white_label: true }));
    const view = widget.createExpandedView();

    expect(view.querySelector('.divee-header .divee-powered-by')).toBeNull();
  });

  test('expanded view still has close button and title regardless of white_label', () => {
    const widget = makeWidget(baseConfig({ white_label: true }));
    const view = widget.createExpandedView();

    expect(view.querySelector('.divee-close')).not.toBeNull();
    expect(view.querySelector('.divee-title')).not.toBeNull();
    expect(view.querySelector('.divee-title').textContent).toBe('Test Site');
  });
});
