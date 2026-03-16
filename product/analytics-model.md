# Analytics Data Model

## Overview
Analytics events are forwarded from the primary project's Edge Functions to the secondary analytics project via `ANALYTICS_PROXY_URL`. The primary project does not write to any local analytics tables.

---

## Mapping to Dashboard Components

Dashboard queries are served from the secondary analytics project at `analytic.divee.ai`.

---

## Events to Track (Server-Side Implementation)

The widget client/server sends the following events to the analytics proxy (`ANALYTICS_PROXY_URL`), which forwards them to the secondary project.

### Event 1: Widget Impression (Load)
**When to send:** Every time the widget is loaded on a page.

**Required Fields:**
```javascript
{
  project_id: "abc123",           // The widget/project ID
  visitor_id: "uuid-visitor-123", // Persistent visitor ID (cookie/localStorage)
  session_id: "uuid-session-456", // Session ID (regenerate per browser session)
  url: "https://example.com/article", // Page URL where widget loaded
  referrer: "https://google.com", // HTTP Referrer
  user_agent: "Mozilla/5.0...",   // Browser user agent
  geo_country: "US",              // Derived from IP (server-side)
  geo_city: "New York",           // Derived from IP (server-side)
  geo_lat: 40.7128,               // Latitude (server-side)
  geo_lng: -74.0060               // Longitude (server-side)
}
```

**Implementation:**
- Send this event immediately when the widget initializes on the page
- Include geo data (derived from IP address on server-side using GeoIP service)
- Use persistent `visitor_id` (localStorage/cookie) to track unique users
- Generate new `session_id` for each browsing session (sessionStorage)

---

### Event 2: Widget Interaction
**When to send:** When users interact with the widget (click, ask question, submit form, etc.)

**Event Types to Track:**
| Event Type | Description | When to Send |
|:-----------|:------------|:-------------|
| `open_chat` | User opens/expands the widget | When chat bubble is clicked |
| `ask_question` | User submits a question | When question is sent |
| `click_suggestion` | User clicks a suggested question | When suggestion button is clicked |
| `click_contact` | User clicks contact/CTA button | When contact button is clicked |
| `submit_form` | User submits a form (if applicable) | On form submission |
| `click_source` | User clicks a source citation | When source link is clicked |

**Required Fields:**
```javascript
{
  project_id: "abc123",           // The widget/project ID
  visitor_id: "uuid-visitor-123", // Same visitor ID as impression
  session_id: "uuid-session-456", // Same session ID as impression
  event_type: "ask_question",     // Type of interaction
  event_label: "Pricing inquiry",  // Optional: descriptive label
  event_data: {                   // Optional: rich event data (jsonb)
    question_text: "How much does it cost?",
    response_time_ms: 1234,
    sources_shown: 3
  }
}
```

**Implementation Examples:**

**Example 1: User Opens Chat Widget**
```javascript
{
  project_id: "widget-xyz",
  visitor_id: "visitor-uuid",
  session_id: "session-uuid",
  event_type: "open_chat",
  event_label: null,
  event_data: {}
}
```

**Example 2: User Asks Question**
```javascript
{
  project_id: "widget-xyz",
  visitor_id: "visitor-uuid",
  session_id: "session-uuid",
  event_type: "ask_question",
  event_label: "Product Question",
  event_data: {
    question_text: "What are your business hours?",
    question_length: 29,
    response_received: true
  }
}
```

**Example 3: User Clicks Suggestion**
```javascript
{
  project_id: "widget-xyz",
  visitor_id: "visitor-uuid",
  session_id: "session-uuid",
  event_type: "click_suggestion",
  event_label: "FAQ Click",
  event_data: {
    suggestion_text: "How do I get started?",
    position: 1  // Which suggestion button (1st, 2nd, 3rd)
  }
}
```

---

## API Endpoint Requirements

Your widget should send these events to an analytics endpoint (e.g., Edge Function or API route).

**Recommended Endpoints:**

1. **POST /api/analytics/impression**
   - Body: Impression data (see Event 1)
   - Called when widget loads

2. **POST /api/analytics/event**
   - Body: Event data (see Event 2)
   - Called on each user interaction

**Implementation Notes:**
- Events should be sent asynchronously (non-blocking)
- Use `navigator.sendBeacon()` for reliable tracking on page unload
- Batch multiple events if sending high volume
- Handle failures gracefully (queue and retry)
- Server should validate and sanitize all inputs
- Server should enrich data with geo information from IP address

---

## Future Considerations
- **Data Retention**: These tables grow fast. Consider partitioning by month (Postgres Partitioning) if volume exceeds millions of rows/month.
- **Rollups**: For faster dashboard loading, a background job (or materialized view) should aggregagte these raw rows into `daily_analytics_stats` (project_id, date, impressions_count, interactions_count).

## Implementation Plan (Revised: Server-Side Tracking)

### 1. Analytics Proxy
*   Ensure `ANALYTICS_PROXY_URL` is configured in the primary project's Edge Function secrets.

### 2. Widget Client (`src/widget.js`)
*   **Session Management**:
    *   Generate `visitor_id` (store in `localStorage`) and `session_id` (store in `sessionStorage`).
*   **API Payloads**:
    *   Update `fetchServerConfig` (called on init) to include `visitor_id`, `session_id`, `referrer` , `user_agent`.
    *   Update `fetchSuggestions` and `streamResponse` (chat) to include these IDs as well.

### 3. Edge Functions
*   **`/chat` Function**:
    *   Forwards `conversation_started`, `conversation_continued`, and question-type events via `logEvent` → `ANALYTICS_PROXY_URL`.
*   **`/suggestions` Function**:
    *   Forwards `get_suggestions` event via `logEvent` → `ANALYTICS_PROXY_URL`.

### 4. Shared Logic (`supabase/functions/_shared/analytics.ts`)
*   A reusable `logEvent(...)` helper in `_shared` keeps business logic clean and forwards events to the secondary analytics endpoint.
