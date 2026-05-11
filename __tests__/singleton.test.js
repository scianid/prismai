/**
 * Singleton Guard Tests
 * Ensures the widget IIFE only initializes once, even if the script is evaluated multiple times.
 */

const { describe, test, expect, beforeEach } = require('@jest/globals');
const fs = require('fs');

const widgetJs = fs.readFileSync('./src/widget.js', 'utf8');

describe('Singleton guard (__diveeWidgetLoaded)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    delete window.__diveeWidgetLoaded;
    delete window.DiveeWidget;
    delete window.DiveeSDK;
  });

  test('first eval defines DiveeWidget on window', () => {
    eval(widgetJs);
    expect(window.DiveeWidget).toBeDefined();
    expect(typeof window.DiveeWidget).toBe('function');
  });

  test('first eval with a script tag sets __diveeWidgetLoaded to true', () => {
    const script = document.createElement('script');
    script.setAttribute('data-project-id', 'test-123');
    document.body.appendChild(script);

    eval(widgetJs);
    expect(window.__diveeWidgetLoaded).toBe(true);
  });

  test('second eval does not overwrite DiveeWidget when guard is set', () => {
    // First eval defines the class
    eval(widgetJs);
    const FirstWidget = window.DiveeWidget;

    // Manually set the guard (as autoInit would after finding a script tag)
    window.__diveeWidgetLoaded = true;

    // Second eval should bail out at the guard
    eval(widgetJs);
    expect(window.DiveeWidget).toBe(FirstWidget);
  });

  test('second eval does not create duplicate widget instances', () => {
    const script = document.createElement('script');
    script.setAttribute('data-project-id', 'test-123');
    document.body.appendChild(script);

    // Suppress fetch calls from autoInit
    fetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    );

    eval(widgetJs);
    const instancesAfterFirst = window.DiveeSDK
      ? window.DiveeSDK.instances().length
      : 0;

    eval(widgetJs);
    const instancesAfterSecond = window.DiveeSDK
      ? window.DiveeSDK.instances().length
      : 0;

    expect(instancesAfterSecond).toBe(instancesAfterFirst);
  });

  test('guard is not set when no script tag with data-project-id exists', () => {
    eval(widgetJs);
    // DiveeWidget class is defined but autoInit doesn't set the flag
    expect(window.DiveeWidget).toBeDefined();
    expect(window.__diveeWidgetLoaded).toBeUndefined();
  });

  test('two script tags with the same projectId only fetch config once', () => {
    // Regression for shmua.com: publisher had `<script data-project-id="X">`
    // pasted twice (once in <head>, once in <body>). Without dedup, each
    // tag spawned its own widget — so three floating buttons appeared on the
    // page and the config endpoint was hit per duplicate.
    const pid = '8896cf03-3071-47f2-b308-5ddc72b452c4';
    [1, 2].forEach(() => {
      const s = document.createElement('script');
      s.setAttribute('data-project-id', pid);
      document.body.appendChild(s);
    });

    fetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    );

    eval(widgetJs);

    const configCalls = fetch.mock.calls.filter(([url]) =>
      typeof url === 'string' && url.includes(`/config?projectId=${pid}`)
    );
    expect(configCalls.length).toBe(1);
  });
});
