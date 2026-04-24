/**
 * sessionStorage access guard
 *
 * The widget touches sessionStorage in four places (session tracking id,
 * suggestions suppression, analytics id cleanup). In some privacy-restricted
 * contexts (Safari private mode, sandboxed iframes, some publisher CSPs)
 * the `sessionStorage` property access itself throws SecurityError:
 *   "Failed to read the 'sessionStorage' property from 'Window': Access is
 *    denied for this document."
 * We saw this in production Sentry traffic. Widget construction must survive
 * it — unguarded access kills init.
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const fs = require('fs');
const widgetJs = fs.readFileSync('./src/widget.js', 'utf8');

function blockSessionStorage() {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage')
    || Object.getOwnPropertyDescriptor(Window.prototype, 'sessionStorage');
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    get() {
      throw new DOMException(
        "Failed to read the 'sessionStorage' property from 'Window': Access is denied for this document.",
        'SecurityError',
      );
    },
  });
  return descriptor;
}

function restoreSessionStorage(descriptor) {
  if (descriptor) {
    Object.defineProperty(window, 'sessionStorage', descriptor);
  } else {
    delete window.sessionStorage;
  }
}

describe('sessionStorage access guard', () => {
  let savedDescriptor = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    try { sessionStorage.clear(); } catch (_) { /* may be blocked by prior test */ }
    delete window.__diveeWidgetLoaded;
    delete window.DiveeWidget;
    delete window.DiveeSDK;
    fetch.mockClear();
    fetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    );
  });

  afterEach(() => {
    if (savedDescriptor !== null) {
      restoreSessionStorage(savedDescriptor);
      savedDescriptor = null;
    }
  });

  test('construction survives when sessionStorage access throws', () => {
    savedDescriptor = blockSessionStorage();
    eval(widgetJs);
    window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();

    // Previously threw inside checkSuggestionsSuppression during construction.
    expect(() => new window.DiveeWidget({ projectId: 'p-blocked' })).not.toThrow();
  });

  test('safeSessionGet returns null when storage is blocked and nothing is cached', () => {
    savedDescriptor = blockSessionStorage();
    eval(widgetJs);
    window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
    const widget = new window.DiveeWidget({ projectId: 'p' });

    expect(widget.safeSessionGet('missing')).toBeNull();
  });

  test('safeSessionSet falls back to in-memory store when blocked', () => {
    savedDescriptor = blockSessionStorage();
    eval(widgetJs);
    window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
    const widget = new window.DiveeWidget({ projectId: 'p' });

    widget.safeSessionSet('k', 'v');
    expect(widget.safeSessionGet('k')).toBe('v');
  });

  test('safeSessionRemove clears in-memory store when blocked', () => {
    savedDescriptor = blockSessionStorage();
    eval(widgetJs);
    window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
    const widget = new window.DiveeWidget({ projectId: 'p' });

    widget.safeSessionSet('k', 'v');
    widget.safeSessionRemove('k');
    expect(widget.safeSessionGet('k')).toBeNull();
  });

  test('getOrCreateSessionTrackingId works under blocked storage', () => {
    savedDescriptor = blockSessionStorage();
    eval(widgetJs);
    window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
    const widget = new window.DiveeWidget({ projectId: 'p' });

    const id1 = widget.getOrCreateSessionTrackingId();
    const id2 = widget.getOrCreateSessionTrackingId();
    expect(id1).toBeTruthy();
    expect(id1).toBe(id2); // stable within the instance via in-memory fallback
  });

  test('suppressSuggestions + checkSuggestionsSuppression works under blocked storage', () => {
    savedDescriptor = blockSessionStorage();
    eval(widgetJs);
    window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
    const widget = new window.DiveeWidget({ projectId: 'p' });

    widget.suppressSuggestions();
    widget.checkSuggestionsSuppression();
    expect(widget.state.suggestionsSuppressed).toBe(true);
  });

  test('when storage is available, writes persist to real sessionStorage', () => {
    // No blocking — this is the normal path. Verify we still hit real storage.
    eval(widgetJs);
    window.DiveeWidget.prototype.init = jest.fn().mockResolvedValue();
    const widget = new window.DiveeWidget({ projectId: 'p' });

    widget.safeSessionSet('k', 'v');
    expect(sessionStorage.getItem('k')).toBe('v');

    widget.safeSessionRemove('k');
    expect(sessionStorage.getItem('k')).toBeNull();
  });
});
