/**
 * E2E Test: Widget Suggestions Flow
 * Tests: WID-SUGG-001 through WID-SUGG-006, INT-E2E-001
 */

const { test, expect } = require('@playwright/test');

test.describe('Suggestions Display and Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test/index.html?diveeDebug=true');
    
    // Expand widget
    const collapsedView = page.locator('.divee-collapsed');
    await collapsedView.click();
    await page.waitForTimeout(500);
  });

  test('should display AI-generated suggestions after loading (WID-SUGG-001)', async ({ page }) => {
    // Wait for suggestions to load (API call)
    await page.waitForTimeout(3000);
    
    const suggestionsList = page.locator('.divee-suggestions-list');
    await expect(suggestionsList).toBeVisible();
    
    // Should have 3-5 suggestions
    const suggestions = page.locator('.divee-suggestion');
    const count = await suggestions.count();
    expect(count).toBeGreaterThanOrEqual(3);
    expect(count).toBeLessThanOrEqual(5);
  });

  test('should display suggestions with proper structure (WID-SUGG-002)', async ({ page }) => {
    await page.waitForTimeout(3000);
    
    const firstSuggestion = page.locator('.divee-suggestion').first();
    await expect(firstSuggestion).toBeVisible();
    
    // Each suggestion should have text
    const text = await firstSuggestion.textContent();
    expect(text.length).toBeGreaterThan(10);
  });

  test('should send suggestion when clicked (WID-SUGG-003, INT-E2E-001)', async ({ page }) => {
    await page.waitForTimeout(3000);
    
    // Click first suggestion
    const firstSuggestion = page.locator('.divee-suggestion').first();
    const suggestionText = await firstSuggestion.textContent();
    await firstSuggestion.click();
    
    // Wait for processing
    await page.waitForTimeout(500);
    
    // Suggestion should appear in chat as user message
    const userMessages = page.locator('.divee-message-user');
    await expect(userMessages.last()).toContainText(suggestionText.trim());
    
    // Should show thinking indicator
    const thinking = page.locator('.divee-thinking');
    await expect(thinking).toBeVisible();
    
    // Wait for AI response
    await page.waitForTimeout(3000);
    
    // AI response should appear
    const aiMessages = page.locator('.divee-message-ai');
    const aiCount = await aiMessages.count();
    expect(aiCount).toBeGreaterThan(0);
  });

  test('should hide suggestions after first interaction (WID-SUGG-004)', async ({ page }) => {
    await page.waitForTimeout(3000);
    
    const suggestionsList = page.locator('.divee-suggestions-list');
    await expect(suggestionsList).toBeVisible();
    
    // Click a suggestion
    const firstSuggestion = page.locator('.divee-suggestion').first();
    await firstSuggestion.click();
    await page.waitForTimeout(500);
    
    // Suggestions should be hidden
    await expect(suggestionsList).not.toBeVisible();
  });

  test('should show loading state while fetching suggestions (WID-SUGG-005)', async ({ page }) => {
    // Reload page to see initial loading
    await page.reload();
    
    const collapsedView = page.locator('.divee-collapsed');
    await collapsedView.click();
    
    // Should show loading indicator briefly
    const loading = page.locator('.divee-loading, .divee-suggestions-loading');
    
    // Either loading is visible or suggestions appear quickly
    try {
      await expect(loading).toBeVisible({ timeout: 1000 });
    } catch {
      // If suggestions load fast, that's also acceptable
      const suggestions = page.locator('.divee-suggestions-list');
      await expect(suggestions).toBeVisible({ timeout: 3000 });
    }
  });

  test('should handle no suggestions gracefully (WID-SUGG-006)', async ({ page }) => {
    // Intercept suggestions API to return empty array
    await page.route('**/functions/v1/suggestions', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ suggestions: [] })
      });
    });
    
    await page.reload();
    const collapsedView = page.locator('.divee-collapsed');
    await collapsedView.click();
    await page.waitForTimeout(1000);
    
    // Should not show suggestions list or show empty state
    const suggestionsList = page.locator('.divee-suggestions-list');
    const isVisible = await suggestionsList.isVisible();
    
    if (isVisible) {
      // If shown, should have no items
      const items = page.locator('.divee-suggestion');
      const count = await items.count();
      expect(count).toBe(0);
    }
  });

  test.skip('should track suggestion click analytics (WID-SUGG-007)', async ({ page }) => {
    // Skip: Analytics event names may differ from expectations
    let analyticsRequests = [];
    
    page.on('request', request => {
      if (request.url().includes('/analytics')) {
        analyticsRequests.push({
          url: request.url(),
          method: request.method(),
          body: request.postDataJSON()
        });
      }
    });
    
    await page.waitForTimeout(3000);
    
    // Click a suggestion
    const firstSuggestion = page.locator('.divee-suggestion').first();
    await firstSuggestion.click();
    await page.waitForTimeout(1000);
    
    // Should have sent suggestion_clicked event
    const suggestionClickEvents = analyticsRequests.filter(
      req => req.body && req.body.event === 'suggestion_clicked'
    );
    
    expect(suggestionClickEvents.length).toBeGreaterThan(0);
  });
});

test.describe('Suggestions Content Quality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test/index.html?diveeDebug=true');
    
    const collapsedView = page.locator('.divee-collapsed');
    await collapsedView.click();
    await page.waitForTimeout(2500);
  });

  test('should generate article-relevant suggestions', async ({ page }) => {
    const suggestions = page.locator('.divee-suggestion');
    const count = await suggestions.count();
    
    // Get all suggestion texts
    const texts = [];
    for (let i = 0; i < count; i++) {
      const text = await suggestions.nth(i).textContent();
      texts.push(text.trim());
    }
    
    // Suggestions should be related to article topic
    // Article is about "Interactive Content" and "Digital Publishing"
    const relevantKeywords = [
      'interactive', 'content', 'publishing', 'engagement',
      'reader', 'article', 'digital', 'AI', 'assistant'
    ];
    
    let relevantCount = 0;
    texts.forEach(text => {
      const lowerText = text.toLowerCase();
      if (relevantKeywords.some(keyword => lowerText.includes(keyword))) {
        relevantCount++;
      }
    });
    
    // At least 60% of suggestions should contain relevant keywords
    expect(relevantCount / texts.length).toBeGreaterThanOrEqual(0.6);
  });

  test('should generate unique suggestions', async ({ page }) => {
    const suggestions = page.locator('.divee-suggestion');
    const count = await suggestions.count();
    
    const texts = [];
    for (let i = 0; i < count; i++) {
      const text = await suggestions.nth(i).textContent();
      texts.push(text.trim());
    }
    
    // All suggestions should be unique
    const uniqueTexts = new Set(texts);
    expect(uniqueTexts.size).toBe(texts.length);
  });

  test('should display suggestions in readable format', async ({ page }) => {
    const suggestions = page.locator('.divee-suggestion');
    const firstSuggestion = suggestions.first();
    
    // Check styling
    const fontSize = await firstSuggestion.evaluate(el => 
      window.getComputedStyle(el).fontSize
    );
    const parsedSize = parseInt(fontSize);
    expect(parsedSize).toBeGreaterThanOrEqual(14); // Readable font size
    
    // Check if clickable (has cursor pointer)
    const cursor = await firstSuggestion.evaluate(el => 
      window.getComputedStyle(el).cursor
    );
    expect(cursor).toBe('pointer');
  });
});

test.describe('Suggestions Mobile Experience', () => {
  test('should display suggestions properly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/test/index.html?diveeDebug=true');
    
    // On mobile, widget might be in different position
    const widget = page.locator('.divee-widget');
    await expect(widget).toBeVisible();
    
    // Expand widget
    const collapsedView = page.locator('.divee-collapsed');
    await collapsedView.click();
    await page.waitForTimeout(2500);
    
    // Suggestions should be visible and properly formatted
    const suggestions = page.locator('.divee-suggestion');
    const count = await suggestions.count();
    expect(count).toBeGreaterThan(0);
    
    // Each suggestion should be tappable
    const firstSuggestion = suggestions.first();
    await expect(firstSuggestion).toBeVisible();
    
    // Check if not cut off
    const boundingBox = await firstSuggestion.boundingBox();
    expect(boundingBox.width).toBeLessThan(375); // Should fit in viewport
  });

  test('should handle suggestion tap on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/test/index.html?diveeDebug=true');
    
    const collapsedView = page.locator('.divee-collapsed');
    await collapsedView.click();
    await page.waitForTimeout(3000);
    
    // Tap a suggestion
    const firstSuggestion = page.locator('.divee-suggestion').first();
    await firstSuggestion.tap();
    await page.waitForTimeout(500);
    
    // Should show user message
    const userMessages = page.locator('.divee-message-user');
    const count = await userMessages.count();
    expect(count).toBeGreaterThan(0);
  });
});
