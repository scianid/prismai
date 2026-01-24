# Technical Product Specification: AI Article Assistant Widget

## Product Overview

A JavaScript embeddable widget that transforms static articles into interactive experiences by providing an AI-powered chat interface directly within news and blog posts. The widget allows readers to ask questions, get summaries, and engage with content through a ChatGPT-like UX while monetizing through ads and suggested content.

---

## Core Features

### 1. **Smart Chat Interface**
- Context-aware AI that understands the article content
- Streaming responses with ChatGPT-like UX
- Preset questions (e.g., "Summarize this article")
- AI-generated suggested questions based on content
- Free-form question input

### 2. **Dynamic UI States**
- **Collapsed State:** Compact widget showing ad/teaser
- **Expanded State:** Full chat interface with streaming responses
- Smooth transitions and animations

### 3. **Monetization**
- Ad display in collapsed state
- Suggested reads/content recommendations
- In-chat promotional content

---

## Technical Architecture

### Integration

```html
<!-- Single line integration -->
<script src="https://cdn.prismai.com/widget.js" 
        data-project-id="proj_xxxxxxxxxxxx"
        data-article-id="article-123">
</script>
```

**Required Parameters:**
- `data-project-id`: Unique project identifier (used for API calls, config, and analytics)
- `data-article-id`: Unique article identifier

### Stack Requirements
- **Frontend:** Vanilla JavaScript (ES6+), no framework dependencies
- **Styling:** CSS-in-JS or scoped CSS to avoid conflicts
- **API:** RESTful or WebSocket for streaming responses
- **Content Extraction:** Automatic article parsing or manual content injection

---

## Design System

### Brand Identity

#### Header Icons
The widget header displays two icons side by side:

```
┌─────────────────────────────────────────┐
│  🤖 [Site Logo] AI Article Assistant  │
│  ↑   ↑                                 │
│  AI  Publisher Site Icon               │
└─────────────────────────────────────────┘
```

**AI Icon:**
- Default: Animated sparkle/brain icon
- Size: 24×24px
- Color: Brand accent color
- Configurable via server config (future)

**Publisher Site Icon:**
- **Phase 1 (MVP):** Hardcoded placeholder logo
- **Phase 2:** Retrieved from server config based on `project_id`
- Size: 24×24px
- Format: SVG preferred, fallback to PNG
- Position: 8px spacing between icons

**Configuration (Server-side):**
```json
{
  "project_id": "proj_xxxxxxxxxxxx",
  "branding": {
    "site_icon": "https://cdn.example.com/logo.svg",
    "site_name": "TechNews Daily",
    "primary_color": "#FF6B35",
    "language": "en"
  }
}
```

### Internationalization

**Language Configuration:**
- Language code retrieved from server config via `project_id`
- Fallback: Browser language detection
- Supported languages: `en`, `es`, `fr`, `de`, `ja`, `pt`, `ar` (Phase 2)

**Text Localization:**
```javascript
{
  "en": {
    "placeholder": "Ask anything about this article...",
    "cta": "Click to ask questions or get insights",
    "loading": "Thinking..."
  },
  "es": {
    "placeholder": "Pregunta cualquier cosa sobre este artículo...",
    "cta": "Haz clic para hacer preguntas u obtener información",
    "loading": "Pensando..."
  }
}
```

### Color System
```css
--primary: Retrieved from server config
--ai-accent: #6366f1 (indigo)
--publisher-accent: From server config
--background: #ffffff
--text-primary: #1f2937
--text-secondary: #6b7280
--border: #e5e7eb
--chat-user-bg: #f3f4f6
--chat-ai-bg: #eff6ff
```

---

## Wireframes

### State 1: Collapsed (Initial Load)

```
┌─────────────────────────────────────────────────────────┐
│  💬 Ask AI about this article                          │
│                                                         │
│  ┌────────────────────────────────────────────────┐   │
│  │                                                 │   │
│  │          [Advertisement Space]                  │   │
│  │         "Sponsored Content"                     │   │
│  │                                                 │   │
│  └────────────────────────────────────────────────┘   │
│                                                         │
│  [Click to ask questions or get insights ↓]            │
└─────────────────────────────────────────────────────────┘
```

**Dimensions:** ~200px height × full article width (max 800px)
**Position:** Bottom of article or inline after first paragraph

---

### State 2: Expanded (Question Selected/Typed)

```
┌─────────────────────────────────────────────────────────────┐
│  💬 AI Article Assistant                            [✕]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Suggested Questions:                                       │
│  ┌──────────────────────────────────────────────┐         │
│  │ 📝 Summarize this article in 3 key points    │         │
│  └──────────────────────────────────────────────┘         │
│  ┌──────────────────────────────────────────────┐         │
│  │ 🤔 What are the main arguments presented?    │         │
│  └──────────────────────────────────────────────┘         │
│  ┌──────────────────────────────────────────────┐         │
│  │ 🔍 Explain [key term] in simple language     │         │
│  └──────────────────────────────────────────────┘         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Ask anything about this article...            [↑]  │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ─────────────────────────────────────────────────────────│
│                                                             │
│  📚 Suggested Reads:                                       │
│  • Related Article 1                                       │
│  • Related Article 2                                       │
└─────────────────────────────────────────────────────────────┘
```

**Dimensions:** ~400px height × full article width (max 800px)
**Interaction:** Smooth height transition (300ms ease)

---

### State 3: Streaming Response

```
┌─────────────────────────────────────────────────────────────┐
│  💬 AI Article Assistant                            [✕]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ You ──────────────────────────────────────────────┐   │
│  │ Summarize this article in 3 key points            │   │
│  └───────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ AI ───────────────────────────────────────────────┐   │
│  │ Here are the three main takeaways:                 │   │
│  │                                                     │   │
│  │ 1. The study shows that interactive content        │   │
│  │    increases engagement by up to 3x compared       │   │
│  │    to static articles. [¹]                         │   │
│  │                                                     │   │
│  │ 2. Publishers lose significant revenue when▊       │   │
│  │                                                     │   │
│  └───────────────────────────────────────────────────┘   │
│                                                             │
│  [¹] Reference to article paragraph 3                      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Ask a follow-up question...                  [↑]  │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ─────────────────────────────────────────────────────────│
│                                                             │
│  🎯 Related Questions:                                     │
│  • What methodology was used in the study?                 │
│  • How can publishers implement this?                      │
│                                                             │
│  ─────────────────────────────────────────────────────────│
│                                                             │
│  📚 Suggested Reads:                                       │
│  • "10 Ways to Boost Article Engagement" | Sponsored       │
│  • "The Future of Digital Publishing"                      │
└─────────────────────────────────────────────────────────────┘
```

**Dimensions:** Dynamic height (min 400px, max 600px) with scroll
**Streaming:** Character-by-character or chunk-based rendering with cursor (▊)

---

## Component Breakdown

### 1. **Container Component**
```javascript
<ArticleAssistant>
  - Manages state (collapsed/expanded/streaming)
  - Handles API communication
  - Tracks analytics events
```

### 2. **Collapsed View**
```javascript
<CollapsedWidget>
  - Ad display component
  - CTA button
  - Teaser text
```

### 3. **Expanded View**
```javascript
<ExpandedWidget>
  <SuggestedQuestions />
  <ChatInterface />
  <InputBox />
  <SuggestedReads />
  <AdSlot />
```

### 4. **Chat Components**
```javascript
<MessageList>
  <UserMessage />
  <AIMessage streaming={true} />
    <CitationLinks />
  </AIMessage>
```

---

## User Interaction Flow

```
┌───────────────┐
│  Page Load    │
└───────┬───────┘
        │
        ▼
┌───────────────────┐
│ Widget Collapsed  │◄─────────┐
│   (Show Ad)       │          │
└───────┬───────────┘          │
        │                       │
        │ User clicks           │
        ▼                       │
┌───────────────────┐          │
│ Widget Expands    │          │
│ Empty text area   │          │
└───────┬───────────┘          │
        │                       │
        │ User clicks inside    │
        │ text area             │
        ▼                       │
┌───────────────────┐          │
│ API Call:         │          │
│ POST /suggestions │          │
│ - project_id      │          │
│ - article_title   │          │
│ - article_content │          │
└───────┬───────────┘          │
        │                       │
        ▼                       │
┌───────────────────┐          │
│ Show 3 Suggested  │          │
│ Questions         │          │
└───────┬───────────┘          │
        │                       │
        │ User selects/         │
        │ types question        │
        ▼                       │
┌───────────────────┐          │
│ Stream Response   │          │
│ Show Citations    │          │
└───────┬───────────┘          │
        │                       │
        │ Display related       │
        │ questions & ads       │
        ▼                       │
┌───────────────────┐          │
│ User can:         │          │
│ - Ask more        │          │
│ - Close widget ───┴──────────┘
│ - Click suggested │
└───────────────────┘
```

### Detailed Flow: Text Area Interaction

1. **Initial Expand:** Widget shows empty text area with placeholder
2. **User Focus:** User clicks/taps inside text area
3. **Trigger API Call:** Widget sends request to `/api/v1/suggestions`
4. **Loading State:** Show spinner or skeleton UI for suggestions
5. **Display Suggestions:** 3 AI-generated questions appear above text area
6. **User Choice:** User can select a suggestion or type custom question

---

## Key UX Principles

### 1. **ChatGPT-Like Experience**
- Smooth streaming with typewriter effect
- Clear message bubbles with visual hierarchy
- Auto-scroll to new content
- Loading states with animated indicators

### 2. **Non-Intrusive Design**
- Collapsed by default
- Easy to dismiss
- Doesn't block article content
- Respects user's reading flow

### 3. **Trust & Transparency**
- Citations link back to article text
- Clear labeling of ads vs. content
- Source attribution for AI responses

### 4. **Performance**
- Lazy loading of widget
- Minimal bundle size (<50KB gzipped)
- Optimized streaming with backpressure
- Graceful degradation

---

## Monetization Integration Points

### 1. **Collapsed State Ad**
- Standard IAB ad units (300×250, 300×50)
- Native ad format
- Sponsored "teaser" questions

### 2. **Suggested Reads**
- Sponsored content recommendations
- Affiliate links
- Related articles with promotional tags

### 3. **In-Chat Sponsorship**
- "This answer brought to you by [Brand]"
- Contextual product recommendations
- Premium content upsells

### 4. **Data Monetization**
- Anonymous question analytics
- Intent signals for advertisers
- Content gap analysis for publishers

---

## Analytics & Tracking

### Events to Track
```javascript
{
  widget_loaded: { project_id, article_id, position },
  widget_expanded: { trigger: 'click' | 'auto' },
  textarea_focused: { timestamp },
  suggestions_fetched: { article_id, suggestions_count, load_time },
  suggestion_clicked: { question, position: 1|2|3 },
  question_asked: { type: 'suggestion' | 'custom', question },
  answer_streamed: { question, duration, citations },
  suggested_read_clicked: { article_id, sponsored },
  ad_impression: { ad_unit, position },
  widget_collapsed: { time_spent, questions_asked }
}
```

---

## Technical Specifications

### Browser Support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Dependencies
- No external frameworks required
- Optional: Intersection Observer for lazy load
- Optional: Markdown parser for formatted responses

### API Requirements

#### POST /api/v1/suggestions
Fetches AI-generated suggested questions when user focuses on text area.

**Request:**
```json
{
  "project_id": "proj_xxxxxxxxxxxx",
  "article_title": "string",
  "article_content": "string (full article text)"
}
```

**Response:**
```json
{
  "suggestions": [
    "What are the 3 main takeaways from this article?",
    "How does this compare to previous research?",
    "What are the practical implications?"
  ],
  "generated_at": "2026-01-12T10:30:00Z"
}
```

**Performance:**
- Target response time: <800ms
- Cache suggestions per article for 1 hour
- Fallback to default questions if API fails

---

#### POST /api/v1/ask
```json
{
  "article_id": "string",
  "question": "string",
  "context": "string (article content)",
  "stream": true
}
```

#### Response (SSE Stream)
```
data: {"type": "token", "content": "Here"}
data: {"type": "token", "content": " are"}
data: {"type": "citation", "paragraph": 3}
data: {"type": "complete"}
```

### Customization Options

**Client-side (Embed Code):**
```javascript
{
  position: 'bottom' | 'inline',
  maxHeight: 600,
  autoExpand: false
}
```

**Server-side Config (Retrieved via project_id):**
```javascript
{
  project_id: 'proj_xxxxxxxxxxxx',
  branding: {
    site_icon: 'https://cdn.example.com/logo.svg',
    site_name: 'Publisher Name',
    primary_color: '#FF6B35'
  },
  language: 'en' | 'es' | 'fr' | 'de' | 'ja' | 'pt' | 'ar',
  theme: 'light' | 'dark' | 'auto',
  features: {
    suggested_reads: true,
    citations: true,
    ads_enabled: true
  },
  ad_slots: ['collapsed', 'expanded'],
  fallback_questions: [
    'Summarize this article',
    'What are the key points?',
    'Explain the main concepts'
  ]
}
```

**Configuration Loading:**
```javascript
// Widget initialization
1. Parse embed code for project_id
2. Fetch config: GET /api/v1/config?project_id=xxx
3. Apply branding (icons, colors, language)
4. Render widget with appropriate settings
```

---

## Implementation Phases

### Phase 1: Core Widget (MVP)
- [ ] Collapsed/expanded states
- [ ] Basic chat UI with dual icons (AI + hardcoded site logo)
- [ ] Text area focus triggers suggestions API call
- [ ] Dynamic suggestions (3 per article)
- [ ] API integration (suggestions + ask endpoints)
- [ ] Project ID configuration
- [ ] Ad slot in collapsed state

### Phase 2: Enhanced UX
- [ ] Streaming responses
- [ ] Server-side config API (branding, language, features)
- [ ] Dynamic site icon loading
- [ ] Multi-language support
- [ ] Citations with highlighting
- [ ] Suggested reads
- [ ] Animations & transitions

### Phase 3: Monetization & Analytics
- [ ] Multiple ad placements
- [ ] Analytics dashboard
- [ ] A/B testing framework
- [ ] Performance optimization

### Phase 4: Advanced Features
- [ ] Multi-language support
- [ ] Voice input
- [ ] Conversation history
- [ ] Personalization
- [ ] Mobile optimization

---

## Success Metrics

### User Engagement
- Widget expansion rate: >25%
- Questions per session: >1.5
- Time on page increase: +3 minutes
- Return visitor rate: +15%

### Monetization
- Ad viewability: >70%
- Click-through rate on suggested reads: >5%
- Revenue per article: +$0.50

### Performance
- Widget load time: <500ms
- Time to first byte (streaming): <200ms
- Bounce rate reduction: -10%

---

## Security & Privacy

- Content Security Policy (CSP) compliant
- GDPR-compliant data handling
- No PII stored without consent
- Secure API authentication
- XSS prevention
- Rate limiting on API endpoints

---

## Future Enhancements

- **Multi-turn conversations:** Maintain context across questions
- **Collaborative reading:** Share questions/answers with other readers
- **Author interaction:** Let authors answer questions directly
- **PDF/Video support:** Extend beyond text articles
- **Browser extension:** Widget for any article on the web
- **Offline mode:** Cache common questions/answers
