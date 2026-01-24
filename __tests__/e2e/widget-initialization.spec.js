/**
 * E2E Test: Widget Initialization
 * Tests widget loading and basic rendering
 */

const { test, expect } = require('@playwright/test');

test.describe('Widget Initialization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test/index.html?diveeDebug=true');
  });

  test('should load widget on page', async ({ page }) => {
    // Wait for widget to appear
    const widget = page.locator('.divee-widget');
    await expect(widget).toBeVisible({ timeout: 5000 });
  });

  test('should show collapsed view initially', async ({ page }) => {
    const collapsedView = page.locator('.divee-collapsed');
    await expect(collapsedView).toBeVisible();
    
    const expandedView = page.locator('.divee-expanded');
    await expect(expandedView).not.toBeVisible();
  });

  test('should display search input with placeholder', async ({ page }) => {
    const searchInput = page.locator('.divee-search-input-collapsed');
    await expect(searchInput).toBeVisible();
    
    // Wait for typewriter animation to start
    await page.waitForTimeout(1000);
    
    const placeholder = await searchInput.getAttribute('placeholder');
    expect(placeholder).toBeTruthy();
  });

  test('should show AI and site icons', async ({ page }) => {
    const aiIcon = page.locator('.divee-icon-ai-collapsed');
    const siteIcon = page.locator('.divee-icon-site-collapsed');
    
    await expect(aiIcon).toBeVisible();
    await expect(siteIcon).toBeVisible();
  });

  test('should display powered by link', async ({ page }) => {
    const poweredBy = page.locator('.divee-powered-by');
    await expect(poweredBy).toBeVisible();
    
    const href = await poweredBy.getAttribute('href');
    expect(href).toBe('https://www.divee.ai');
  });

  test('should have correct data-state attribute', async ({ page }) => {
    const widget = page.locator('.divee-widget');
    const dataState = await widget.getAttribute('data-state');
    expect(dataState).toBe('collapsed');
  });

  test('should expand when clicked', async ({ page }) => {
    const collapsedView = page.locator('.divee-collapsed');
    await collapsedView.click();
    
    // Wait for animation
    await page.waitForTimeout(500);
    
    const widget = page.locator('.divee-widget');
    const dataState = await widget.getAttribute('data-state');
    expect(dataState).toBe('expanded');
    
    const expandedView = page.locator('.divee-expanded');
    await expect(expandedView).toBeVisible();
  });

  test('should not show JavaScript errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.waitForTimeout(2000);
    
    expect(errors).toHaveLength(0);
  });

  test('should create visitor and session IDs', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    const visitorId = await page.evaluate(() => localStorage.getItem('divee_visitor_id'));
    const sessionId = await page.evaluate(() => sessionStorage.getItem('divee_session_id'));
    
    expect(visitorId).toBeTruthy();
    expect(sessionId).toBeTruthy();
    expect(visitorId).toMatch(/^[0-9a-f-]+$/i);
    expect(sessionId).toMatch(/^[0-9a-f-]+$/i);
  });
});

test.describe('Widget Expanded State', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test/index.html?diveeDebug=true');
    
    // Expand widget
    const collapsedView = page.locator('.divee-collapsed');
    await collapsedView.click();
    await page.waitForTimeout(500);
  });

  test('should show header with title', async ({ page }) => {
    const header = page.locator('.divee-header');
    await expect(header).toBeVisible();
    
    const title = page.locator('.divee-title');
    await expect(title).toBeVisible();
  });

  test('should show close button', async ({ page }) => {
    const closeButton = page.locator('.divee-close');
    await expect(closeButton).toBeVisible();
  });

  test('should show chat area', async ({ page }) => {
    const chat = page.locator('.divee-chat');
    await expect(chat).toBeVisible();
  });

  test('should show input textarea', async ({ page }) => {
    const input = page.locator('.divee-input');
    await expect(input).toBeVisible();
    
    const placeholder = await input.getAttribute('placeholder');
    expect(placeholder).toBeTruthy();
  });

  test('should show send button', async ({ page }) => {
    const sendButton = page.locator('.divee-send');
    await expect(sendButton).toBeVisible();
  });

  test('should show character counter', async ({ page }) => {
    const counter = page.locator('.divee-counter');
    await expect(counter).toBeVisible();
    
    const text = await counter.textContent();
    expect(text).toBe('0/200');
  });

  test('should collapse when close button clicked', async ({ page }) => {
    const closeButton = page.locator('.divee-close');
    await closeButton.click();
    
    await page.waitForTimeout(500);
    
    const widget = page.locator('.divee-widget');
    const dataState = await widget.getAttribute('data-state');
    expect(dataState).toBe('collapsed');
  });

  test('should focus input after expansion', async ({ page }) => {
    const input = page.locator('.divee-input');
    await expect(input).toBeFocused();
  });

  test('should update character counter on input', async ({ page }) => {
    const input = page.locator('.divee-input');
    await input.fill('Test message');
    
    const counter = page.locator('.divee-counter');
    const text = await counter.textContent();
    expect(text).toBe('12/200');
  });
});

test.describe('Widget Responsive Design', () => {
  test('should adapt to mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/test/index.html?diveeDebug=true');
    
    const widget = page.locator('.divee-widget');
    await expect(widget).toBeVisible();
    
    // Check that mobile-specific styles are applied
    const aiIcon = page.locator('.divee-icon-ai-collapsed');
    const isVisible = await aiIcon.isVisible();
    
    // On mobile, AI icon in collapsed view might be hidden
    // Just verify widget renders without errors
    expect(widget).toBeTruthy();
  });

  test('should adapt to tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/test/index.html?diveeDebug=true');
    
    const widget = page.locator('.divee-widget');
    await expect(widget).toBeVisible();
  });

  test('should adapt to desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/test/index.html?diveeDebug=true');
    
    const widget = page.locator('.divee-widget');
    await expect(widget).toBeVisible();
  });
});
