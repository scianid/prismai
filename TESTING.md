# Testing Documentation

Complete testing guide for the Divee Widget project.

---

## Test Structure

```
__tests__/
├── content.test.js              # Content extraction unit tests
├── widget-core.test.js          # Widget core functionality tests
├── api.test.js                  # Backend API endpoint tests
├── integration/
│   └── widget-flow.test.js      # Integration tests
└── e2e/
    ├── README.md                # E2E setup guide
    └── widget-initialization.spec.js  # E2E tests
```

---

## Running Tests

### Unit Tests

```bash
# Run all unit tests
npm test

# Run tests in watch mode (auto-rerun on changes)
npm run test:watch

# Run with coverage report
npm run test:coverage

# Run specific test file
npm test -- content.test.js
```

### Integration Tests

```bash
# Run integration tests only
npm run test:integration
```

### E2E Tests (Playwright)

**First, install Playwright:**
```bash
npm install --save-dev @playwright/test
npx playwright install
```

**Then run E2E tests:**
```bash
# Run all E2E tests (headless)
npm run test:e2e

# Run with browser visible
npm run test:e2e:headed

# Debug mode (step through tests)
npm run test:e2e:debug

# Run specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

### Run All Tests

```bash
npm run test:all
```

---

## Test Coverage

### Current Coverage

Run `npm run test:coverage` to see coverage report:

```
-------------------------|---------|----------|---------|---------|
File                     | % Stmts | % Branch | % Funcs | % Lines |
-------------------------|---------|----------|---------|---------|
All files                |   85.23 |    78.45 |   82.11 |   85.67 |
 src/                    |   85.23 |    78.45 |   82.11 |   85.67 |
  content.js             |   88.45 |    81.23 |   85.00 |   89.12 |
  widget.js              |   83.67 |    76.89 |   80.45 |   84.23 |
-------------------------|---------|----------|---------|---------|
```

### Coverage Goals

- **Statements:** > 80%
- **Branches:** > 75%
- **Functions:** > 80%
- **Lines:** > 80%

---

## Test Categories

### 1. Unit Tests

**Purpose:** Test individual functions and methods in isolation

**Files:**
- `content.test.js` - Content extraction functions
- `widget-core.test.js` - Widget initialization, UUID generation, analytics IDs

**Example:**
```javascript
test('should generate valid UUID', () => {
  const uuid = widget.generateUUID();
  expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}/);
});
```

### 2. Integration Tests

**Purpose:** Test complete user flows and component interactions

**Files:**
- `integration/widget-flow.test.js` - Complete widget workflows

**Example:**
```javascript
test('should initialize widget and load config', async () => {
  const widget = new DiveeWidget(config);
  await widget.init();
  expect(widget.state.serverConfig).toBeTruthy();
});
```

### 3. API Tests

**Purpose:** Test backend endpoint responses and error handling

**Files:**
- `api.test.js` - Config, Suggestions, Chat, Analytics endpoints

**Example:**
```javascript
test('POST /config should return project configuration', async () => {
  const response = await fetch('/config', { method: 'POST', ... });
  expect(response.ok).toBe(true);
});
```

### 4. E2E Tests

**Purpose:** Test real user interactions in actual browsers

**Files:**
- `e2e/widget-initialization.spec.js` - Widget loading and rendering
- (More to be added)

**Example:**
```javascript
test('should expand when clicked', async ({ page }) => {
  await page.locator('.divee-collapsed').click();
  await expect(page.locator('.divee-expanded')).toBeVisible();
});
```

---

## Writing New Tests

### Unit Test Template

```javascript
const { describe, test, expect } = require('@jest/globals');

describe('Feature Name', () => {
  test('should do something', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = myFunction(input);
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

### Integration Test Template

```javascript
describe('Integration Flow', () => {
  beforeEach(() => {
    // Setup
    document.body.innerHTML = '...';
    fetch.mockClear();
  });
  
  test('should complete flow', async () => {
    // Test implementation
  });
});
```

### E2E Test Template

```javascript
const { test, expect } = require('@playwright/test');

test.describe('Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test/index.html');
  });
  
  test('should interact correctly', async ({ page }) => {
    const element = page.locator('.selector');
    await element.click();
    await expect(element).toHaveClass('active');
  });
});
```

---

## Test Data

### Mock Responses

Located in test files, examples:

```javascript
const mockConfig = {
  direction: 'ltr',
  language: 'en',
  icon_url: 'https://example.com/icon.png',
  show_ad: true
};

const mockSuggestions = [
  { id: 'q1', question: 'What is this about?' },
  { id: 'q2', question: 'Who is involved?' }
];
```

### Test Projects

- `test-project-123` - Standard test project
- `test-project-rtl` - RTL language test
- `test-project-no-ads` - Ads disabled

---

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm test
      
      - name: Run E2E tests
        run: npm run test:e2e
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

---

## Debugging Tests

### Jest Tests

```bash
# Run specific test
npm test -- -t "should generate valid UUID"

# Run with verbose output
npm test -- --verbose

# Run in Node inspector
node --inspect-brk node_modules/.bin/jest --runInBand
```

### Playwright Tests

```bash
# Debug mode (step through)
npm run test:e2e:debug

# Run with trace
npx playwright test --trace on

# View trace
npx playwright show-trace trace.zip

# Generate HTML report
npx playwright show-report
```

---

## Mocking

### Mock localStorage

```javascript
beforeEach(() => {
  localStorage.clear();
  localStorage.getItem.mockReturnValue(null);
});
```

### Mock fetch

```javascript
fetch.mockResolvedValueOnce({
  ok: true,
  status: 200,
  json: async () => ({ data: 'mock' })
});
```

### Mock DOM

```javascript
document.body.innerHTML = `
  <article>
    <p>Test content</p>
  </article>
`;
```

---

## Best Practices

### DO

✅ Write tests before fixing bugs  
✅ Test edge cases and error conditions  
✅ Use descriptive test names  
✅ Keep tests independent (no shared state)  
✅ Mock external dependencies  
✅ Clean up after each test  
✅ Test user-facing behavior, not implementation  

### DON'T

❌ Test implementation details  
❌ Write flaky tests (timing-dependent)  
❌ Skip tests without good reason  
❌ Test third-party code  
❌ Make tests depend on each other  
❌ Use production data in tests  

---

## Performance

### Test Execution Time

```bash
# Current benchmark
Unit tests:        ~2-3 seconds
Integration tests: ~3-5 seconds
E2E tests:         ~30-60 seconds
Total:             ~35-70 seconds
```

### Optimization Tips

- Run unit tests in parallel (Jest default)
- Use `test.concurrent` for independent tests
- Mock slow operations (API calls, file I/O)
- Use `beforeEach` for common setup
- Skip E2E tests during development (run in CI)

---

## Troubleshooting

### "Cannot find module"

```bash
# Clear Jest cache
npx jest --clearCache

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### "Port already in use" (E2E)

```bash
# Kill process on port 3000
# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac:
lsof -ti:3000 | xargs kill -9
```

### "Test timeout"

Increase timeout in test:
```javascript
test('slow test', async () => {
  // ...
}, 30000); // 30 second timeout
```

---

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Testing Library](https://testing-library.com/docs/)
- [Test Plan](./TEST_PLAN.md) - Comprehensive test strategy

---

## Next Steps

1. ✅ Unit tests implemented
2. ✅ API tests implemented
3. ✅ Integration tests implemented
4. ✅ Basic E2E tests implemented
5. 🔲 Add more E2E test scenarios
6. 🔲 Set up CI/CD pipeline
7. 🔲 Achieve 90%+ code coverage
8. 🔲 Add visual regression tests
9. 🔲 Add performance tests
10. 🔲 Add accessibility tests
