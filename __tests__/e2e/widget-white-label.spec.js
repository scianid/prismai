/**
 * E2E Test: White Label Mode
 * Tests that Divee branding is hidden when white_label is enabled
 * and visible when disabled.
 */

const { test, expect } = require('@playwright/test');

/**
 * Intercept the widget config request and merge extra fields into the response.
 * This lets us control white_label (and any other config flag) without a real backend.
 */
async function interceptConfig(page, overrides) {
  await page.route('**/config?projectId=*', async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...json, ...overrides }),
    });
  });
}

// ── White label OFF (default) — branding visible ─────────────────────────

test.describe('Widget branding — white_label OFF', () => {
  test.beforeEach(async ({ page }) => {
    await interceptConfig(page, { white_label: false });
    await page.goto('/test/index.html?diveeDebug=true');
    await expect(page.locator('.divee-widget')).toBeVisible({ timeout: 5000 });
  });

  test('collapsed view shows "powered by divee.ai" link', async ({ page }) => {
    const poweredBy = page.locator('.divee-powered-by').first();
    await expect(poweredBy).toBeVisible();

    const href = await poweredBy.getAttribute('href');
    expect(href).toBe('https://www.divee.ai');

    const text = await poweredBy.textContent();
    expect(text).toContain('powered by divee.ai');
  });

  test('expanded view shows "powered by divee.ai" link in header', async ({ page }) => {
    // Expand widget
    const collapsed = page.locator('.divee-collapsed');
    await collapsed.click();
    await page.waitForTimeout(500);

    const headerPoweredBy = page.locator('.divee-header .divee-powered-by');
    await expect(headerPoweredBy).toBeVisible();

    const href = await headerPoweredBy.getAttribute('href');
    expect(href).toBe('https://www.divee.ai');
  });
});

// ── White label ON — branding hidden ─────────────────────────────────────

test.describe('Widget branding — white_label ON', () => {
  test.beforeEach(async ({ page }) => {
    await interceptConfig(page, { white_label: true });
    await page.goto('/test/index.html?diveeDebug=true');
    await expect(page.locator('.divee-widget')).toBeVisible({ timeout: 5000 });
  });

  test('collapsed view does NOT show "powered by divee.ai" link', async ({ page }) => {
    const poweredBy = page.locator('.divee-collapsed .divee-powered-by');
    await expect(poweredBy).toHaveCount(0);
  });

  test('expanded view does NOT show "powered by divee.ai" link in header', async ({ page }) => {
    // Expand widget
    const collapsed = page.locator('.divee-collapsed');
    await collapsed.click();
    await page.waitForTimeout(500);

    const headerPoweredBy = page.locator('.divee-header .divee-powered-by');
    await expect(headerPoweredBy).toHaveCount(0);
  });

  test('widget still renders correctly without branding', async ({ page }) => {
    // Collapsed view essentials still present
    const searchInput = page.locator('.divee-search-input-collapsed');
    await expect(searchInput).toBeVisible();

    // Expand and verify core UI
    const collapsed = page.locator('.divee-collapsed');
    await collapsed.click();
    await page.waitForTimeout(500);

    await expect(page.locator('.divee-header')).toBeVisible();
    await expect(page.locator('.divee-title')).toBeVisible();
    await expect(page.locator('.divee-close')).toBeVisible();
    await expect(page.locator('.divee-input')).toBeVisible();
    await expect(page.locator('.divee-send')).toBeVisible();
  });

  test('no JavaScript errors with white_label enabled', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Interact with widget to exercise code paths
    const collapsed = page.locator('.divee-collapsed');
    await collapsed.click();
    await page.waitForTimeout(1000);

    expect(errors).toHaveLength(0);
  });
});

// ── White label not set in config (backwards compatibility) ──────────────

test.describe('Widget branding — white_label absent from config', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept config and explicitly remove white_label to simulate old configs
    await page.route('**/config?projectId=*', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      delete json.white_label;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(json),
      });
    });
    await page.goto('/test/index.html?diveeDebug=true');
    await expect(page.locator('.divee-widget')).toBeVisible({ timeout: 5000 });
  });

  test('branding is shown when white_label is not in config (default behaviour)', async ({ page }) => {
    const poweredBy = page.locator('.divee-powered-by').first();
    await expect(poweredBy).toBeVisible();
  });
});
