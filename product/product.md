# PrismAI: Article Assistant Widget

## The Problem

### The "Read & Run" Reality

- **Static Fatigue:** Readers consume an article and immediately bounce. They don't dig deeper because the friction of finding more info is too high.

- **Information Overload:** Long-form content is often skimmed. Key insights are missed because readers can't "ctrl+f" for concepts, only words.

- **Loss of Revenue:** Every time a reader leaves to Google a term or a follow-up question, the publisher loses a monetization opportunity.

---

## The Solution

### PrismAI: The Conversational Layer

We transform articles from monologues into dialogues. Our embedded AI widget acts as a real-time subject matter expert sitting right inside your content.

- **Context-Aware:** It doesn't just know the web; it knows your specific article.

- **Zero-Friction:** No new tabs, no external searches. Just instant clarity.

- **Multi-Language Support:** Full RTL support for Hebrew, Arabic, and other right-to-left languages with customizable direction and language settings.

- **Fully Customizable:** Brand colors, messaging, positioning, and behavior all configurable per client.

---

## Key Features (The "Ask" Engine)

- **Instant Summarization:** "What are the 3 main takeaways from this report?"

- **Deep-Dive Q&A:** "Why did the CEO make this decision?" or "Explain this technical term in simple language."

- **In-Text Citations:** Every answer includes direct references back to the article text to ensure accuracy and trust.

- **Smart Suggestions:** Context-aware suggested questions generated based on article content that prompt the reader to engage before they even think to ask.

- **Streaming Responses:** Real-time AI responses with typewriter effect for natural, engaging interaction.

- **Intelligent UI/UX:**
  - Animated typewriter placeholders with rotating suggestion text
  - Smooth expand/collapse transitions
  - Suggested article recommendations
  - Character counter and input validation
  - Mobile-responsive design

- **Advertisement Integration:** Built-in ad slots for monetization without compromising user experience.

---

## Why Publishers Love It

### Turning Curiosity into Currency

- **Boost Time-on-Site:** Interactive readers stay 3x longer than passive readers.
:
  ```html
  <script src="https://cdn.prismai.com/widget.js" 
          data-project-id="your-project-id"
          data-article-id="unique-article-id"></script>
  ```

- **Brand-Safe:** Tuned to stay within the guardrails of the publisher's voice and the specific content provided.

---

## Technical Architecture

### Modern, Scalable Infrastructure

- **Supabase Backend:** PostgreSQL database with Row Level Security (RLS) for secure data isolation
- **Edge Functions:** Serverless API endpoints deployed globally for low latency
- **RESTful APIs:**
  - `GET /functions/v1/get-config` - Fetch widget configuration per project
  - `POST /functions/v1/suggestions` - Generate contextual questions
  - Future: `/chat`, `/analytics`, `/feedback` endpoints

### Security First

- **No Direct Database Access:** All client requests routed through Edge Functions
- **Service Role Authorization:** Backend operations use secure service keys
- **CORS-Enabled:** Safe cross-origin requests from publisher domains

### Database Schema

**`project` Table:**
- Widget configuration per client (colors, text, positioning)
- Customizable greetings and placeholder messages
- API endpoint configuration
- Automatic timestamp tracking

---

## Integration Guide

### Quick Start

1. **Sign Up:** Get your unique project ID
2. **Customize:** Configure colors, messages, and behavior in the dashboard
3. **Embed:** Add one script tag to your article pages
4. **Deploy:** Widget automatically initializes and connects to your configuration

### Configuration Options

```javascript
{
  projectId: 'your-unique-id',
  position: 'bottom',           // Widget placement
  maxHeight: 600,               // Max expanded height
  autoExpand: false,            // Auto-expand on page load
  apiBaseUrl: 'custom-api-url'  // Optional custom API endpoint
}
```

---

## Analytics & Insights

Track reader engagement:
- Questions asked (custom vs. suggested)
- Time spent interacting
- Most common queries per article
- Bounce rate reduction
- Session duration increase
- **SEO & Authority:** Keep the entire "search journey" on your domain rather than sending users back to Google.

---

## User Experience

> "It's like having the author of the article standing right next to you, ready to explain the nuance of every paragraph."

- **Seamless Integration:** A single line of code.

- **Brand-Safe:** Tuned to stay within the guardrails of the publisher's voice and the specific content provided.