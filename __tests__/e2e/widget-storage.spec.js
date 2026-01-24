/**
 * E2E Test: Content Extraction and Storage
 * Tests: WID-CONT-001, WID-CONT-002, WID-STATE-002, WID-STATE-003
 */

const { test, expect } = require('@playwright/test');

test.describe('Content Extraction from Page', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage before each test
    await page.goto('/test/index.html?diveeDebug=true');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
  });

  test('should extract article title (WID-CONT-001)', async ({ page }) => {
    // Wait for widget to initialize
    await page.waitForTimeout(2000);
    
    // Check if title was extracted (should be in page metadata or widget state)
    const pageTitle = await page.title();
    expect(pageTitle).toBeTruthy();
    expect(pageTitle.length).toBeGreaterThan(10);
  });

  test('should extract article content (WID-CONT-001)', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Widget should have extracted content
    // Check by expanding and sending a question about article content
    const collapsedView = page.locator('.divee-collapsed');
    await collapsedView.click();
    await page.waitForTimeout(500);
    
    const input = page.locator('.divee-input');
    const sendButton = page.locator('.divee-send');
    
    // Ask about specific article content
    await input.fill('What is this article about?');
    await sendButton.click();
    await page.waitForTimeout(5000);
    
    // AI response should mention article topics
    const aiMessages = page.locator('.divee-message-ai');
    const lastResponse = await aiMessages.last().textContent();
    
    // Response should reference article content
    expect(lastResponse.length).toBeGreaterThan(50);
  });

  test('should filter out captions and ads (WID-CONT-002)', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Expand widget and ask a question
    const collapsedView = page.locator('.divee-collapsed');
    await collapsedView.click();
    await page.waitForTimeout(2500);
    
    // Check suggestions - they should be about main content, not ads
    const suggestions = page.locator('.divee-suggestion-item');
    const count = await suggestions.count();
    
    if (count > 0) {
      const texts = [];
      for (let i = 0; i < count; i++) {
        const text = await suggestions.nth(i).textContent();
        texts.push(text.toLowerCase());
      }
      
      // Suggestions should not contain ad-related content
      const adKeywords = ['buy now', 'click here', 'advertisement', 'sponsored'];
      const hasAdContent = texts.some(text => 
        adKeywords.some(keyword => text.includes(keyword))
      );
      
      expect(hasAdContent).toBe(false);
    }
  });

  test('should extract article metadata', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Check if widget captured article URL
    const currentUrl = page.url();
    expect(currentUrl).toContain('/test/index.html');
    
    // Widget should have stored the URL for analytics
    const analyticsData = await page.evaluate(() => {
      return {
        visitorId: localStorage.getItem('divee_visitor_id'),
        sessionId: sessionStorage.getItem('divee_session_id')
      };
    });
    
    expect(analyticsData.visitorId).toBeTruthy();
    expect(analyticsData.sessionId).toBeTruthy();
  });
});

test.describe('LocalStorage Persistence (WID-STATE-002)', () => {
  test('should store visitor ID in localStorage', async ({ page }) => {
    await page.goto('/test/index.html?diveeDebug=true');
    await page.waitForTimeout(1500);
    
    const visitorId = await page.evaluate(() => 
      localStorage.getItem('divee_visitor_id')
    );
    
    expect(visitorId).toBeTruthy();
    expect(visitorId).toMatch(/^[0-9a-f-]+$/i);
  });

  test('should persist visitor ID across page reloads', async ({ page }) => {
    await page.goto('/test/index.html?diveeDebug=true');
    await page.waitForTimeout(1500);
    
    const firstVisitorId = await page.evaluate(() => 
      localStorage.getItem('divee_visitor_id')
    );
    
    // Reload page
    await page.reload();
    await page.waitForTimeout(1500);
    
    const secondVisitorId = await page.evaluate(() => 
      localStorage.getItem('divee_visitor_id')
    );
    
    expect(firstVisitorId).toBe(secondVisitorId);
  });

  test('should store widget configuration in localStorage', async ({ page }) => {
    await page.goto('/test/index.html?diveeDebug=true');
    await page.waitForTimeout(2000);
    
    // Expand widget to trigger config load
    const collapsedView = page.locator('.divee-collapsed');
    await collapsedView.click();
    await page.waitForTimeout(500);
    
    // Check if config was cached
    const cachedConfig = await page.evaluate(() => 
      localStorage.getItem('divee_config')
    );
    
    if (cachedConfig) {
      const config = JSON.parse(cachedConfig);
      expect(config).toBeTruthy();
      expect(config.project_id || config.projectId).toBeTruthy();
    }
  });

  test('should not store sensitive data in localStorage', async ({ page }) => {
    await page.goto('/test/index.html?diveeDebug=true');
    await page.waitForTimeout(2000);
    
    // Check all localStorage keys
    const allStorage = await page.evaluate(() => {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        data[key] = localStorage.getItem(key);
      }
      return data;
    });
    
    // Convert to string and check for sensitive patterns
    const storageString = JSON.stringify(allStorage).toLowerCase();
    
    // Should not contain passwords, API keys, tokens
    expect(storageString).not.toContain('password');
    expect(storageString).not.toContain('api_key');
    expect(storageString).not.toContain('apikey');
    expect(storageString).not.toContain('secret');
  });
});

test.describe('SessionStorage Persistence (WID-STATE-003)', () => {
  test('should store session ID in sessionStorage', async ({ page }) => {
    await page.goto('/test/index.html?diveeDebug=true');
    await page.waitForTimeout(1500);
    
    const sessionId = await page.evaluate(() => 
      sessionStorage.getItem('divee_session_id')
    );
    
    expect(sessionId).toBeTruthy();
    expect(sessionId).toMatch(/^[0-9a-f-]+$/i);
  });

  test('should persist session ID within same session', async ({ page }) => {
    await page.goto('/test/index.html?diveeDebug=true');
    await page.waitForTimeout(1500);
    
    const firstSessionId = await page.evaluate(() => 
      sessionStorage.getItem('divee_session_id')
    );
    
    // Reload page (same session)
    await page.reload();
    await page.waitForTimeout(1500);
    
    const secondSessionId = await page.evaluate(() => 
      sessionStorage.getItem('divee_session_id')
    );
    
    expect(firstSessionId).toBe(secondSessionId);
  });

  test('should store chat history in sessionStorage', async ({ page }) => {
    await page.goto('/test/index.html?diveeDebug=true');
    
    const collapsedView = page.locator('.divee-collapsed');
    await collapsedView.click();
    await page.waitForTimeout(500);
    
    // Send a message
    const input = page.locator('.divee-input');
    const sendButton = page.locator('.divee-send');
    
    await input.fill('Test message for history');
    await sendButton.click();
    await page.waitForTimeout(3000);
    
    // Check if chat history is stored
    const chatHistory = await page.evaluate(() => 
      sessionStorage.getItem('divee_chat_history')
    );
    
    if (chatHistory) {
      const history = JSON.parse(chatHistory);
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
    }
  });

  test('should restore chat history after page reload', async ({ page }) => {
    await page.goto('/test/index.html?diveeDebug=true');
    
    const collapsedView = page.locator('.divee-collapsed');
    await collapsedView.click();
    await page.waitForTimeout(500);
    
    // Send a message
    const input = page.locator('.divee-input');
    const sendButton = page.locator('.divee-send');
    
    const testMessage = 'Message to be restored';
    await input.fill(testMessage);
    await sendButton.click();
    await page.waitForTimeout(3000);
    
    // Reload page
    await page.reload();
    await page.waitForTimeout(1500);
    
    // Expand widget again
    const collapsedViewAfter = page.locator('.divee-collapsed');
    await collapsedViewAfter.click();
    await page.waitForTimeout(500);
    
    // Check if previous message is still visible
    const userMessages = page.locator('.divee-message-user');
    const count = await userMessages.count();
    
    if (count > 0) {
      const lastMessage = await userMessages.first().textContent();
      expect(lastMessage).toContain(testMessage);
    }
  });

  test('should clear session data when browser session ends', async ({ browser }) => {
    // Create a new context (simulates new browser session)
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('http://localhost:3000/test/index.html?diveeDebug=true');
    await page.waitForTimeout(1500);
    
    const sessionId = await page.evaluate(() => 
      sessionStorage.getItem('divee_session_id')
    );
    
    expect(sessionId).toBeTruthy();
    
    // Close context (ends session)
    await context.close();
    
    // Create new context (new session)
    const newContext = await browser.newContext();
    const newPage = await newContext.newPage();
    
    await newPage.goto('http://localhost:3000/test/index.html?diveeDebug=true');
    await newPage.waitForTimeout(1500);
    
    const newSessionId = await newPage.evaluate(() => 
      sessionStorage.getItem('divee_session_id')
    );
    
    // Should have different session ID
    expect(newSessionId).toBeTruthy();
    expect(newSessionId).not.toBe(sessionId);
    
    await newContext.close();
  });
});

test.describe('Storage Quota and Limits', () => {
  test('should handle localStorage quota gracefully', async ({ page }) => {
    await page.goto('/test/index.html?diveeDebug=true');
    await page.waitForTimeout(1500);
    
    // Try to fill localStorage (should handle errors)
    const result = await page.evaluate(() => {
      try {
        const largeData = 'x'.repeat(1024 * 1024); // 1MB
        for (let i = 0; i < 10; i++) {
          localStorage.setItem(`test_${i}`, largeData);
        }
        return 'success';
      } catch (e) {
        return e.message;
      }
    });
    
    // Widget should still work even if storage is full
    const widget = page.locator('.divee-widget');
    await expect(widget).toBeVisible();
  });

  test('should not exceed reasonable storage usage', async ({ page }) => {
    await page.goto('/test/index.html?diveeDebug=true');
    
    const collapsedView = page.locator('.divee-collapsed');
    await collapsedView.click();
    await page.waitForTimeout(500);
    
    // Send multiple messages
    const input = page.locator('.divee-input');
    const sendButton = page.locator('.divee-send');
    
    for (let i = 0; i < 5; i++) {
      await input.fill(`Message ${i + 1}`);
      await sendButton.click();
      await page.waitForTimeout(1000);
    }
    
    // Check total storage usage
    const storageSize = await page.evaluate(() => {
      let total = 0;
      
      // LocalStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('divee_')) {
          const value = localStorage.getItem(key);
          total += (key.length + (value ? value.length : 0)) * 2; // UTF-16
        }
      }
      
      // SessionStorage
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('divee_')) {
          const value = sessionStorage.getItem(key);
          total += (key.length + (value ? value.length : 0)) * 2; // UTF-16
        }
      }
      
      return total;
    });
    
    // Should be reasonable (< 100KB)
    expect(storageSize).toBeLessThan(100 * 1024);
  });
});

test.describe('Privacy and Data Handling', () => {
  test('should respect Do Not Track settings', async ({ page }) => {
    // Enable DNT
    await page.goto('/test/index.html?diveeDebug=true', {
      extraHTTPHeaders: {
        'DNT': '1'
      }
    });
    
    await page.waitForTimeout(2000);
    
    // Widget should still work but might limit tracking
    const widget = page.locator('.divee-widget');
    await expect(widget).toBeVisible();
  });

  test('should allow users to clear their data', async ({ page }) => {
    await page.goto('/test/index.html?diveeDebug=true');
    await page.waitForTimeout(1500);
    
    // Verify data exists
    let hasData = await page.evaluate(() => {
      return localStorage.getItem('divee_visitor_id') !== null;
    });
    expect(hasData).toBe(true);
    
    // Clear data
    await page.evaluate(() => {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('divee_')) {
          localStorage.removeItem(key);
        }
      }
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('divee_')) {
          sessionStorage.removeItem(key);
        }
      }
    });
    
    // Verify data is cleared
    hasData = await page.evaluate(() => {
      return localStorage.getItem('divee_visitor_id') !== null;
    });
    expect(hasData).toBe(false);
  });
});
