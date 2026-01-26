/**
 * E2E Test: Conversation Flow
 * Tests multi-turn conversations with message history and persistence
 */

const { test, expect } = require('@playwright/test');

// Configuration
const TEST_URL = process.env.TEST_URL || 'http://localhost:3000/test';
const WIDGET_TIMEOUT = 10000;

test.describe('Conversation Flow', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to test page
    await page.goto(TEST_URL);
    
    // Wait for widget to initialize
    await page.waitForSelector('.divee-widget', { timeout: WIDGET_TIMEOUT });
  });

  // TODO: These tests require data-testid attributes to be added to widget elements
  test.skip('should create conversation and persist conversation ID', async ({ page }) => {
    // Open widget
    await page.click('.divee-search-input-collapsed');
    await page.waitForSelector('.divee-input');
    
    // Ask first question
    const input = page.locator('[data-testid="divee-input"]');
    await input.fill('What is this article about?');
    await page.click('[data-testid="divee-send"]');
    
    // Wait for response
    await page.waitForSelector('[data-testid="divee-message-ai"]', { timeout: 15000 });
    
    // Check sessionStorage for conversation ID
    const conversationId = await page.evaluate(() => {
      const articleUrl = document.querySelector('meta[property="og:url"]')?.content || window.location.href;
      return sessionStorage.getItem(`divee_conversation_${articleUrl}`);
    });
    
    expect(conversationId).toBeTruthy();
    expect(conversationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test.skip('should maintain conversation context across multiple questions', async ({ page }) => {
    // Open widget
    await page.click('[data-testid="divee-toggle"]');
    await page.waitForSelector('[data-testid="divee-input"]');
    
    // First question
    const input = page.locator('[data-testid="divee-input"]');
    await input.fill('What is quantum computing?');
    await page.click('[data-testid="divee-send"]');
    await page.waitForSelector('[data-testid="divee-message-ai"]', { timeout: 15000 });
    
    // Second question referring to previous context
    await input.fill('What are its main applications?');
    await page.click('[data-testid="divee-send"]');
    
    // Wait for second response
    await page.waitForSelector('[data-testid="divee-message-ai"]:nth-of-type(2)', { timeout: 15000 });
    
    // Check that there are 2 user messages and 2 AI messages
    const userMessages = await page.locator('[data-testid="divee-message-user"]').count();
    const aiMessages = await page.locator('[data-testid="divee-message-ai"]').count();
    
    expect(userMessages).toBe(2);
    expect(aiMessages).toBe(2);
  });

  test.skip('should preserve conversation after closing and reopening widget', async ({ page }) => {
    // Open widget and ask question
    await page.click('[data-testid="divee-toggle"]');
    await page.waitForSelector('[data-testid="divee-input"]');
    
    const input = page.locator('[data-testid="divee-input"]');
    await input.fill('Tell me about AI');
    await page.click('[data-testid="divee-send"]');
    await page.waitForSelector('[data-testid="divee-message-ai"]', { timeout: 15000 });
    
    // Close widget
    await page.click('[data-testid="divee-toggle"]');
    
    // Wait a bit
    await page.waitForTimeout(1000);
    
    // Reopen widget
    await page.click('[data-testid="divee-toggle"]');
    await page.waitForSelector('[data-testid="divee-input"]');
    
    // Check that previous message is still there
    const messages = await page.locator('[data-testid="divee-message-user"]').count();
    expect(messages).toBeGreaterThan(0);
  });

  test.skip('should create separate conversations for different articles', async ({ page, context }) => {
    // First article conversation
    await page.click('[data-testid="divee-toggle"]');
    await page.waitForSelector('[data-testid="divee-input"]');
    
    const input = page.locator('[data-testid="divee-input"]');
    await input.fill('First article question');
    await page.click('[data-testid="divee-send"]');
    await page.waitForSelector('[data-testid="divee-message-ai"]', { timeout: 15000 });
    
    const conversationId1 = await page.evaluate(() => {
      const articleUrl = document.querySelector('meta[property="og:url"]')?.content || window.location.href;
      return sessionStorage.getItem(`divee_conversation_${articleUrl}`);
    });
    
    // Navigate to different article (simulate by changing URL in test environment)
    const newPage = await context.newPage();
    await newPage.goto(TEST_URL + '?article=2');
    await newPage.waitForSelector('[data-testid="divee-widget"]', { timeout: WIDGET_TIMEOUT });
    
    // Second article conversation
    await newPage.click('[data-testid="divee-toggle"]');
    await newPage.waitForSelector('[data-testid="divee-input"]');
    
    const input2 = newPage.locator('[data-testid="divee-input"]');
    await input2.fill('Second article question');
    await newPage.click('[data-testid="divee-send"]');
    await newPage.waitForSelector('[data-testid="divee-message-ai"]', { timeout: 15000 });
    
    const conversationId2 = await newPage.evaluate(() => {
      const articleUrl = document.querySelector('meta[property="og:url"]')?.content || window.location.href;
      return sessionStorage.getItem(`divee_conversation_${articleUrl}`);
    });
    
    // Verify different conversation IDs
    expect(conversationId1).not.toBe(conversationId2);
    
    await newPage.close();
  });

  test.skip('should handle conversation reset', async ({ page }) => {
    // Open widget and start conversation
    await page.click('[data-testid="divee-toggle"]');
    await page.waitForSelector('[data-testid="divee-input"]');
    
    const input = page.locator('[data-testid="divee-input"]');
    await input.fill('Test message');
    await page.click('[data-testid="divee-send"]');
    await page.waitForSelector('[data-testid="divee-message-ai"]', { timeout: 15000 });
    
    // Clear conversation (if widget has this feature)
    const clearButton = page.locator('[data-testid="divee-clear"]');
    if (await clearButton.isVisible()) {
      await clearButton.click();
      
      // Verify messages are cleared
      const messageCount = await page.locator('[data-testid="divee-message-user"]').count();
      expect(messageCount).toBe(0);
      
      // Verify new conversation can be started
      await input.fill('New conversation');
      await page.click('[data-testid="divee-send"]');
      await page.waitForSelector('[data-testid="divee-message-ai"]', { timeout: 15000 });
      
      const messages = await page.locator('[data-testid="divee-message-user"]').count();
      expect(messages).toBe(1);
    }
  });

  test.skip('should handle streaming responses in conversation', async ({ page }) => {
    await page.click('[data-testid="divee-toggle"]');
    await page.waitForSelector('[data-testid="divee-input"]');
    
    const input = page.locator('[data-testid="divee-input"]');
    await input.fill('Explain machine learning');
    await page.click('[data-testid="divee-send"]');
    
    // Wait for streaming to start
    await page.waitForSelector('[data-testid="divee-message-ai"]', { timeout: 5000 });
    
    // Check for streaming indicator
    const streamingIndicator = page.locator('[data-testid="divee-streaming"]');
    if (await streamingIndicator.isVisible()) {
      expect(await streamingIndicator.isVisible()).toBe(true);
    }
    
    // Wait for streaming to complete
    await page.waitForSelector('[data-testid="divee-message-ai"]', { timeout: 15000 });
    
    // Verify message is complete
    const messageText = await page.locator('[data-testid="divee-message-ai"]').first().textContent();
    expect(messageText).toBeTruthy();
    expect(messageText.length).toBeGreaterThan(50);
  });

  test.skip('should include conversation ID in network requests', async ({ page }) => {
    // Setup request interception
    const requests = [];
    page.on('request', request => {
      if (request.url().includes('/chat')) {
        requests.push(request);
      }
    });
    
    // Open widget and ask first question
    await page.click('[data-testid="divee-toggle"]');
    await page.waitForSelector('[data-testid="divee-input"]');
    
    const input = page.locator('[data-testid="divee-input"]');
    await input.fill('First question');
    await page.click('[data-testid="divee-send"]');
    await page.waitForSelector('[data-testid="divee-message-ai"]', { timeout: 15000 });
    
    // First request should not have conversation_id
    const firstRequest = requests[0];
    const firstBody = JSON.parse(firstRequest.postData() || '{}');
    expect(firstBody.conversation_id).toBeUndefined();
    
    // Ask second question
    await input.fill('Second question');
    await page.click('[data-testid="divee-send"]');
    await page.waitForSelector('[data-testid="divee-message-ai"]:nth-of-type(2)', { timeout: 15000 });
    
    // Second request should have conversation_id
    const secondRequest = requests[1];
    const secondBody = JSON.parse(secondRequest.postData() || '{}');
    expect(secondBody.conversation_id).toBeTruthy();
    expect(secondBody.conversation_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test.skip('should handle conversation error gracefully', async ({ page }) => {
    // Mock a network error
    await page.route('**/chat', route => {
      route.abort('failed');
    });
    
    await page.click('[data-testid="divee-toggle"]');
    await page.waitForSelector('[data-testid="divee-input"]');
    
    const input = page.locator('[data-testid="divee-input"]');
    await input.fill('Test question');
    await page.click('[data-testid="divee-send"]');
    
    // Wait for error message
    const errorMessage = page.locator('[data-testid="divee-error"]');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
    
    // Verify widget is still functional
    const sendButton = page.locator('[data-testid="divee-send"]');
    await expect(sendButton).toBeEnabled();
  });

  test.skip('should limit message history display', async ({ page }) => {
    await page.click('[data-testid="divee-toggle"]');
    await page.waitForSelector('[data-testid="divee-input"]');
    
    const input = page.locator('[data-testid="divee-input"]');
    
    // Send multiple questions quickly
    for (let i = 1; i <= 5; i++) {
      await input.fill(`Question ${i}`);
      await page.click('[data-testid="divee-send"]');
      await page.waitForTimeout(2000); // Wait between questions
    }
    
    // Wait for responses
    await page.waitForTimeout(5000);
    
    // Check message count
    const userMessages = await page.locator('[data-testid="divee-message-user"]').count();
    expect(userMessages).toBeLessThanOrEqual(20); // Should respect 20 message limit
  });
});

test.describe('Conversation Persistence', () => {
  
  test.skip('should maintain conversation across page refresh', async ({ page }) => {
    // Start conversation
    await page.goto(TEST_URL);
    await page.waitForSelector('[data-testid="divee-widget"]', { timeout: WIDGET_TIMEOUT });
    
    await page.click('[data-testid="divee-toggle"]');
    await page.waitForSelector('[data-testid="divee-input"]');
    
    const input = page.locator('[data-testid="divee-input"]');
    await input.fill('Remember this message');
    await page.click('[data-testid="divee-send"]');
    await page.waitForSelector('[data-testid="divee-message-ai"]', { timeout: 15000 });
    
    // Get conversation ID
    const conversationIdBefore = await page.evaluate(() => {
      const articleUrl = document.querySelector('meta[property="og:url"]')?.content || window.location.href;
      return sessionStorage.getItem(`divee_conversation_${articleUrl}`);
    });
    
    // Refresh page
    await page.reload();
    await page.waitForSelector('[data-testid="divee-widget"]', { timeout: WIDGET_TIMEOUT });
    
    // Check if conversation ID is restored
    const conversationIdAfter = await page.evaluate(() => {
      const articleUrl = document.querySelector('meta[property="og:url"]')?.content || window.location.href;
      return sessionStorage.getItem(`divee_conversation_${articleUrl}`);
    });
    
    expect(conversationIdAfter).toBe(conversationIdBefore);
    
    // Open widget and verify message history
    await page.click('[data-testid="divee-toggle"]');
    await page.waitForSelector('[data-testid="divee-input"]');
    
    const messageCount = await page.locator('[data-testid="divee-message-user"]').count();
    expect(messageCount).toBeGreaterThan(0);
  });

  test.skip('should clear conversation on new session', async ({ page, context }) => {
    // First session
    await page.goto(TEST_URL);
    await page.waitForSelector('[data-testid="divee-widget"]', { timeout: WIDGET_TIMEOUT });
    
    await page.click('[data-testid="divee-toggle"]');
    await page.waitForSelector('[data-testid="divee-input"]');
    
    const input = page.locator('[data-testid="divee-input"]');
    await input.fill('First session message');
    await page.click('[data-testid="divee-send"]');
    await page.waitForSelector('[data-testid="divee-message-ai"]', { timeout: 15000 });
    
    // Close page (simulates closing browser)
    await page.close();
    
    // New session (new page with cleared sessionStorage)
    const newPage = await context.newPage();
    await newPage.goto(TEST_URL);
    await newPage.waitForSelector('[data-testid="divee-widget"]', { timeout: WIDGET_TIMEOUT });
    
    // Check that conversation ID is not present
    const conversationId = await newPage.evaluate(() => {
      const articleUrl = document.querySelector('meta[property="og:url"]')?.content || window.location.href;
      return sessionStorage.getItem(`divee_conversation_${articleUrl}`);
    });
    
    expect(conversationId).toBeNull();
    
    await newPage.close();
  });
});
