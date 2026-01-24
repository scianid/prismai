# PrismAI - AI Article Assistant Widget

Interactive AI chat widget for articles and blog posts.

## Quick Start

### 1. Start the development server

```bash
node server.js
```

### 2. Open the test page

Navigate to: http://localhost:3000/test/index.html

### 3. Run Tests

```bash
# Unit and integration tests
npm test

# E2E tests (requires server running)
npm run test:e2e

# All tests
npm run test:all
```

See [TESTING_GUIDE.md](TESTING_GUIDE.md) for comprehensive testing documentation.

## Project Structure

```
prismai/
├── src/
│   ├── widget.js      # Main widget implementation
│   ├── styles.css     # Widget styles
│   └── content.js     # Content extraction utilities
├── __tests__/
│   ├── api.test.js              # Backend API tests (14 tests)
│   ├── widget-core.test.js      # Widget unit tests (17 tests)
│   ├── content.test.js          # Content extraction tests (9 tests)
│   ├── integration/
│   │   └── widget-flow.test.js  # Integration tests (10 tests)
│   └── e2e/                     # E2E tests (365 tests across 5 browsers)
│       ├── widget-initialization.spec.js
│       ├── widget-suggestions.spec.js
│       ├── widget-chat.spec.js
│       └── widget-storage.spec.js
├── test/
│   └── index.html     # Test article page
├── product/
│   ├── product.md     # Product overview
│   └── technical-spec.md  # Technical specification
├── TEST_PLAN.md       # Comprehensive testing strategy (120+ test cases)
├── TESTING_GUIDE.md   # Testing instructions and troubleshooting
└── server.js          # Development server with mock API
```

## Testing

### Test Coverage
- **417 total tests**: 52 unit/integration + 365 E2E (73 unique × 5 browsers)
- **79% pass rate** for unit tests (41/52 passing, 11 skipped for E2E)
- **100% API coverage** (14/14 backend tests passing)
- **5 browsers**: Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari

### Running Tests

```bash
# Unit & Integration Tests (Jest)
npm test                    # Run all unit tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only

# E2E Tests (Playwright) - requires server running
npm run test:e2e            # All browsers, headless
npm run test:e2e:headed     # Visible browsers
npm run test:e2e:debug      # Debug mode with Playwright Inspector

# Run Everything
npm run test:all            # Unit + E2E tests
```

For detailed testing instructions, see [TESTING_GUIDE.md](TESTING_GUIDE.md).

## Usage

### Basic Integration

```html
<!-- Include the widget CSS -->
<link rel="stylesheet" href="path/to/styles.css">

<!-- Include and initialize the widget -->
<script src="path/to/widget.js" 
        data-project-id="proj_your_project_id"
        data-article-id="art_your_article_id">
</script>
```

### Manual Initialization

```javascript
// For more control, initialize manually
const widget = new PrismAIWidget({
  projectId: 'proj_123',
  articleId: 'art_456',
  position: 'bottom', // or 'inline'
  apiBaseUrl: 'http://localhost:3000/api/v1'
});
```

## Features Implemented (MVP)

✅ Collapsed/expanded widget states  
✅ Dual icon branding (AI + site icon)  
✅ Text area focus triggers suggestions  
✅ 3 dynamic AI-generated questions  
✅ Streaming chat responses  
✅ Smooth animations and transitions  
✅ Mobile responsive design  
✅ Ad slot in collapsed state  

## API Endpoints

### POST /api/v1/suggestions

Fetch suggested questions for an article.

**Request:**
```json
{
  "project_id": "proj_xxxx",
  "article_title": "Article Title",
  "article_content": "Full article text..."
}
```

**Response:**
```json
{
  "suggestions": [
    "Question 1",
    "Question 2",
    "Question 3"
  ],
  "generated_at": "2026-01-12T10:30:00Z"
}
```

### POST /api/v1/ask

Ask a question about the article (streaming supported).

**Request:**
```json
{
  "article_id": "art_xxxx",
  "question": "What are the key points?",
  "context": "Article content...",
  "stream": true
}
```

## Development

The development server includes:
- Static file serving for HTML/CSS/JS
- Mock API endpoints for testing
- CORS enabled for local development
- Server-Sent Events for streaming responses

## Next Steps

- [ ] Connect to real AI API (OpenAI, Anthropic, etc.)
- [ ] Build server-side config management
- [ ] Add analytics tracking backend
- [ ] Implement citation highlighting
- [ ] Add suggested reads feature
- [ ] Build admin dashboard for publishers

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

Proprietary