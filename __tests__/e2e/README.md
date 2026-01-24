# End-to-End Testing Setup Guide

This guide explains how to set up and run E2E tests for the Divee widget using Playwright.

## Installation

```bash
npm install --save-dev @playwright/test
npx playwright install
```

## Configuration

Create `playwright.config.js` in the project root (see below).

## Test Structure

```
__tests__/
  e2e/
    widget-initialization.spec.js
    widget-interaction.spec.js
    suggestions.spec.js
    chat.spec.js
    analytics.spec.js
    responsive.spec.js
```

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test file
npx playwright test __tests__/e2e/widget-initialization.spec.js

# Run tests in headed mode (see browser)
npx playwright test --headed

# Run tests in specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Debug tests
npx playwright test --debug
```

## Test Environment

E2E tests require:
1. Local development server running (`npm start`)
2. Test page at `http://localhost:3000/test/index.html`
3. Mock backend or staging backend

## Writing E2E Tests

Example test structure:

```javascript
const { test, expect } = require('@playwright/test');

test.describe('Widget Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/test/index.html');
  });

  test('should do something', async ({ page }) => {
    // Test implementation
    const widget = await page.locator('.divee-widget');
    await expect(widget).toBeVisible();
  });
});
```

## Best Practices

1. **Use data attributes** for test selectors
2. **Wait for elements** before interacting
3. **Take screenshots** on failures
4. **Mock external APIs** when possible
5. **Test on multiple browsers**
6. **Use page objects** for complex flows

## CI/CD Integration

Add to GitHub Actions:

```yaml
- name: Install Playwright
  run: npx playwright install --with-deps

- name: Run E2E tests
  run: npm run test:e2e
```

## Debugging Failed Tests

```bash
# Show trace viewer
npx playwright show-trace trace.zip

# Generate HTML report
npx playwright show-report
```

## Visual Regression Testing

Playwright supports visual comparisons:

```javascript
await expect(page).toHaveScreenshot('widget-collapsed.png');
```

## Performance Testing

Measure widget performance:

```javascript
const metrics = await page.evaluate(() => performance.getEntriesByType('navigation')[0]);
```
