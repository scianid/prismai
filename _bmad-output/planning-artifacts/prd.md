---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
inputDocuments:
  - '_bmad-output/planning-artifacts/product-brief-prismai-2026-01-27.md'
  - '_bmad-output/suggested-reads-feature-brainstorm.md'
  - '_bmad-output/suggested-reads-card-ux-spec.md'
  - 'product/product.md'
workflowType: 'prd'
project_name: 'prismai'
feature_name: 'Suggested Reads'
user_name: 'Moshe'
date: '2026-01-27'
briefCount: 1
researchCount: 0
brainstormingCount: 1
projectDocsCount: 1
classification:
  projectType: 'web_app'
  domain: 'general'
  complexity: 'medium'
  projectContext: 'brownfield'
---

# Product Requirements Document - Suggested Reads Feature

**Author:** Moshe
**Date:** 2026-01-27

## Executive Summary

The Suggested Reads feature introduces in-chat content recommendation cards within the PrismAI/Divee.AI chat widget. When readers engage with the AI assistant, they'll see visually appealing article suggestions appear naturally in the conversation flow (after every 2nd AI response). This MVP validates the hypothesis that contextual, conversation-embedded suggestions will increase reader engagement, reduce bounce rates, and drive multi-article consumption. Success is measured by 8-10% CTR in Week 1, 15-25% bounce reduction, and zero performance impact on publisher sites. The feature is intentionally lean (≤15KB gzipped) and builds on existing infrastructure with no publisher integration changes required.

## Success Criteria

### User Success

**John's "Aha!" Moment:**
The instant John sees a suggestion card with a headline that's actually interesting - before he even clicks. Success = relevant, visually appealing suggestions that spark curiosity.

**Quantitative User Metrics:**
- **Click-through rate (CTR):** 10-15% hypothesis (to be validated)
- **Bounce reduction:** 15-25% drop in single-article sessions
- **Multi-article engagement:** Increase from ~1.3 → 2.0+ articles per session
- **Dismissal rate:** ≤7% (feature is useful, not annoying)

### Business Success

**Sarah's "Worth It" Moment:**
Week 1 dashboard shows **CTR ≥8%** - early validation that readers are engaging with suggestions.

**Validation Milestones:**
- **30-day go/no-go:** CTR ≥8%, dismissal ≤7%, zero P0/P1 bugs
- **90-day scale decision:** CTR ≥10%, 30% increase in multi-article sessions, 3+ happy publishers providing positive feedback
- **12-month positioning:** Market positioning as "the only AI chat widget with in-conversation content discovery"

### Technical Success

- **Bundle size:** Suggested Reads feature adds **≤15KB gzipped** to widget
- **Page load impact:** No measurable degradation to page load performance
- **Analytics accuracy:** 100% event tracking reliability (no dropped events)
- **Zero breaking bugs:** No P0/P1 bugs in production during first 30 days

### Measurable Outcomes

| Metric | Target | Timeframe |
|--------|--------|-----------|
| CTR (Click-through rate) | ≥8-10% | Week 1-4 |
| Bounce rate reduction | 15-25% | Month 1 |
| Articles per session | 2.0+ | Month 1 |
| Dismissal rate | ≤7% | Ongoing |
| Bundle size | ≤15KB gzipped | Pre-launch |
| P0/P1 bugs | 0 | First 30 days |

## User Journeys

### Journey 1: John - The Casual Reader (Primary User)

**Opening Scene:**
Tuesday evening, 8pm. John finishes an article about AI regulation on his phone. Interesting read, but now what? He's bored but doesn't want to scroll through a generic feed of clickbait headlines.

**Rising Action:**
He notices the Divee.AI chat widget and asks: "What are the main criticisms of this regulation?" The AI responds with a thoughtful answer. He asks a follow-up question. After his second question, **suggestion cards appear** smoothly in the chat interface.

**Critical Moment:**
John sees a headline: "Why EU AI Regulation Failed in Practice" - it catches his attention. The image is relevant, the title is compelling. He's skeptical but curious. He clicks.

**Climax - The "Aha!" Moment:**
The article loads in a new tab. Within 3 seconds of reading the first paragraph, John thinks: **"Yes, this is exactly what I wanted to know more about."** The suggestion was spot-on - not generic, not clickbait, but genuinely relevant to what he was learning. He's impressed.

**Resolution:**
John returns to the chat tab. More suggestions have appeared. He clicks another one. Then another. 20 minutes later, he's read 3 articles on the topic - way more engaged than he expected to be on a random Tuesday evening. He bookmarks the site. Tomorrow, he comes back and starts another conversation.

**Emotional Arc:** Bored → Curious → Skeptical → Delighted → Engaged

---

### Journey 2: Sarah - The Analytics Manager (Secondary User)

**Opening Scene:**
Wednesday morning, 9am. Sarah opens her weekly analytics dashboard with her coffee. Same routine - checking bounce rates, time-on-site, article performance. She's frustrated because bounce rates are still stubbornly high despite all their content quality improvements.

**Rising Action:**
She notices something new in the dashboard - **a metric she doesn't recognize.** "Suggestion CTR: 9.2%" - wait, what suggestions?

She digs deeper. Clicks into the event data. Sees new events: `suggestion_shown`, `suggestion_clicked`, `suggestion_dismissed_confirmed`. She realizes the Divee.AI team shipped something new. **She's curious and impressed** - they didn't make a big announcement, just shipped it and let the data speak.

**Investigation:**
Sarah filters the data to understand impact. Multi-article sessions. Last week: 1.3 articles per session. This week: **1.8 articles per session**. A 38% increase. She double-checks the date ranges, filters, statistical significance. It's real. Readers are actually staying and consuming more content.

**Climax - The "Worth It" Moment:**
Sarah leans back in her chair, looking at the graph showing the multi-article session trend climbing steadily. **She smiles to herself.** No need to announce it in Slack yet. No need to write a report. She just knows it's working. That quiet satisfaction of watching a feature actually deliver measurable value without the hype cycle.

**Resolution:**
Sarah adds the Suggested Reads metrics to her weekly executive dashboard - CTR, multi-article sessions, dismissal rate. Over the next month, she watches the trends continue upward. Bounce rates start dropping. Ad revenue per session ticks up. She becomes the internal champion for the feature - not loudly, but when executives ask "what's driving the engagement improvements?", she shows the data and says simply: "This one's working."

**Emotional Arc:** Frustrated → Curious → Impressed → Satisfied → Advocate

---

### Journey Requirements Summary

These journeys reveal the following capability requirements:

**From John's Journey:**
- In-chat suggestion card UI that appears contextually during conversation
- Article recommendation algorithm (even simple random selection for MVP)
- Click tracking and new-tab navigation behavior
- Visual card design that creates curiosity (image + compelling title)
- Suggestion quality validation (relevance to conversation context for future versions)

**From Sarah's Journey:**
- Analytics dashboard integration showing suggestion performance metrics
- Event tracking: shown, clicked, dismissed events
- Multi-article session calculation and reporting
- CTR calculation and trending over time
- Data filtering and segmentation capabilities

**Cross-Journey Requirements:**
- Session management (tracking user engagement across multiple articles)
- Dismissal mechanism (if user doesn't want suggestions)
- Performance monitoring (bundle size, load time impact)
- Zero breaking changes to existing widget functionality

## Web App Specific Requirements

### Project-Type Overview

The Suggested Reads feature is an **embeddable JavaScript widget component** that loads within the existing PrismAI/Divee.AI chat widget on publisher websites. It must be lightweight, performant, and compatible across modern browsers without breaking existing page functionality.

### Browser Compatibility Matrix

**Supported Browsers:**
- Chrome/Chromium (latest 2 versions)
- Firefox (latest 2 versions)
- Safari desktop (latest 2 versions)
- Safari iOS/mobile (latest 2 versions)
- Edge (Chromium-based, latest 2 versions)

**Explicitly Not Supported:**
- Internet Explorer 11 (deprecated)
- Legacy Edge (pre-Chromium)

**Testing Strategy:**
- Primary testing on latest stable versions
- Graceful degradation for unsupported browsers (feature hidden, no breaking errors)

### Responsive Design Requirements

**Breakpoints:**
- **Desktop:** ≥1024px (full card layout)
- **Tablet:** 768px - 1023px (adjusted spacing)
- **Mobile:** ≤767px (optimized card layout)

**Design Considerations:**
- Touch-friendly targets (minimum 44px tap areas on mobile)
- Smooth animations on all device types
- RTL (right-to-left) language support for international publishers

### Performance Targets

**Bundle Size:**
- Feature code: **≤15KB gzipped** (aggressive target)
- No external dependencies added to widget bundle
- Lazy-load images (only load when cards visible)

**Load Time Impact:**
- **Zero blocking behavior** on host page load
- Widget initializes asynchronously
- No measurable impact on publisher page speed metrics

**Runtime Performance:**
- Smooth 60fps animations
- No layout thrashing
- Minimal memory footprint

### SEO Strategy

**Not Applicable:** The widget is client-side JavaScript with no SEO requirements. Publisher article content (loaded in new tabs) maintains its own SEO independently.

### Accessibility Level (WCAG 2.1 AA)

**Keyboard Navigation:**
- Tab: Navigate between suggestion cards and dismiss button
- Enter/Space: Activate focused card or button
- Escape: Close dismissal confirmation dialog

**Screen Reader Support:**
- ARIA labels for all interactive elements
- `aria-label` on suggestion cards describing article title
- `aria-live` announcements when suggestions appear
- Semantic HTML structure

**Visual Accessibility:**
- Color contrast ratio ≥4.5:1 for text (WCAG AA standard)
- Focus indicators visible on all interactive elements
- No reliance on color alone for information
- Support for browser zoom up to 200%

**Testing Requirements:**
- Test with screen readers (NVDA, JAWS, VoiceOver)
- Keyboard-only navigation validation
- Color contrast validation tools

### Implementation Considerations

**Embedding Strategy:**
- Widget component loads within existing PrismAI iframe architecture
- No changes to publisher integration (zero publisher dev work)
- Feature toggle controlled server-side via project configuration

**JavaScript Architecture:**
- Modern ES6+ syntax (transpiled for browser compatibility)
- No jQuery or heavy framework dependencies
- Modular code structure for maintainability

**CSS Isolation:**
- Scoped styles to prevent conflicts with publisher CSS
- BEM naming convention or CSS modules
- Match existing AI message styling for visual consistency

**State Management:**
- Session-based dismissal via `sessionStorage`
- Conversation state tracking (message counter for timing)
- No persistent user-level data storage in MVP

**Error Handling:**
- Graceful degradation if article fetch fails (show available suggestions)
- Silent failure if analytics tracking fails (don't break UX)
- Console warnings (not errors) for debugging

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** **Problem-Solving MVP** - The minimum feature set required to validate that in-chat content suggestions meaningfully increase reader engagement and reduce bounce rates.

**Core Hypothesis:** If we show relevant article suggestions during active AI conversations, readers will click them and consume more content than they would have otherwise.

**MVP Success Definition:** 
- 8%+ CTR in Week 1
- Measurably increased multi-article sessions
- Zero breaking bugs affecting existing widget functionality
- Publishers don't complain about page load impact

**Resource Requirements:**
- 1 frontend developer (JavaScript/CSS)
- 1 backend developer (Supabase/analytics)
- Design assets already complete (UX spec provided)
- Timeline: 2-3 week sprint

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
- John (reader) sees suggestions during chat conversation, clicks interesting articles, reads multiple articles in one session
- Sarah (analytics manager) sees engagement metrics in dashboard, validates feature is working

**Must-Have Capabilities:**

**Presentation Layer:**
- In-chat suggestion cards appearing after every 2nd AI response (#2, #4, #6, #8...)
- Horizontal card layout: 80px image, title (15px semibold, 3-line clamp), "DIVE DEEPER..." label
- Match existing AI message styling (border, background, spacing)
- Smooth entrance animations
- Responsive design (desktop/tablet/mobile breakpoints)
- RTL support (leveraging existing widget RTL infrastructure)

**Selection Algorithm:**
- Random selection: 4 suggestions from most recent 10 articles
- Filtered by project_id (same publisher)
- Exclude current article
- Graceful degradation: show available articles if < 4 exist, suppress if 0

**Interaction Behavior:**
- Click: Opens article in new tab (preserves conversation context)
- Two-step dismissal: X button → confirmation dialog → session suppression via sessionStorage
- Dismissal cancellation option

**Analytics Tracking:**
- 5 core events: `suggestion_shown`, `suggestion_clicked`, `suggestion_x_clicked`, `suggestion_dismissed_confirmed`, `suggestion_dismissed_cancelled`
- Event data: project_id, article_id, conversation_id, timestamp
- Dashboard integration for Sarah's analytics view

**Technical Constraints:**
- ≤15KB gzipped feature code
- Zero blocking on page load
- WCAG 2.1 AA accessibility compliance
- No backend architecture changes (use existing Supabase)

### Post-MVP Features

**Phase 2: Enhanced Intelligence (3-6 months post-launch)**

**Context-Aware Recommendations:**
- Analyze conversation topics to suggest relevant articles
- Improve beyond random selection with simple relevance scoring
- A/B test timing variations (after 2nd vs 3rd vs 4th response)

**Publisher Configuration:**
- Publisher-facing controls for suggestion frequency
- Custom styling options (colors, fonts to match brand)
- Enable/disable toggle per project

**Image Optimization:**
- Advanced fallback strategies (gradient backgrounds, placeholder images)
- Image lazy-loading optimization
- CDN integration for faster image delivery

**Enhanced Analytics:**
- CTR breakdown by article topic
- Time-of-day engagement patterns
- Multi-article session flow visualization

**Phase 3: Platform & Ecosystem (12+ months post-launch)**

**ML-Powered Personalization:**
- User preference learning (which topics they engage with)
- Cross-session personalization (returning readers)
- Predictive CTR modeling

**Publisher Dashboard:**
- Dedicated analytics portal for publishers
- Content performance insights
- Recommendation quality scoring

**Advanced Features:**
- Cross-publisher recommendation network (opt-in)
- Integration with publisher CMS systems
- Real-time trending content suggestions
- Custom recommendation rules and business logic

### Risk Mitigation Strategy

**Technical Risks:**

**Risk:** Bundle size exceeds 15KB target, publishers complain about performance
**Mitigation:** 
- Code-split non-critical features (animations can be basic)
- Measure gzipped size in CI/CD pipeline
- Set hard size limit that breaks build if exceeded

**Risk:** Random algorithm produces irrelevant suggestions, CTR suffers
**Mitigation:**
- "Recent 10" keeps suggestions fresh and topical
- Monitor CTR closely in Week 1
- Prepare context-aware algorithm as fast-follow if CTR < 5%

**Market Risks:**

**Risk:** Publishers don't see enough value, reject feature
**Mitigation:**
- Launch with 3-5 friendly publishers who committed to test
- Show engagement metrics weekly
- 30-day go/no-go decision protects against sunk cost

**Risk:** Readers find suggestions annoying, high dismissal rate
**Mitigation:**
- Two-step dismissal prevents accidents
- Monitor dismissal rate (target ≤7%)
- Session-only suppression means fresh chance next visit

**Resource Risks:**

**Risk:** Development takes longer than 3 weeks
**Mitigation:**
- UX spec already complete (no design delays)
- Use existing Supabase architecture (no backend greenfield work)
- Feature toggle allows partial deployment

**Risk:** Team capacity constrained by other priorities
**Mitigation:**
- MVP is intentionally small (2-3 week scope)
- No external dependencies or coordination needed
- Can pause/resume without losing context

## Functional Requirements

### Content Suggestion Display

- **FR1:** Readers can view article suggestion cards within the chat interface during active conversations
- **FR2:** Readers can see 4 article suggestions per suggestion set
- **FR3:** Readers can view article titles (up to 3 lines) within suggestion cards
- **FR4:** Readers can view article images (80px width) within suggestion cards
- **FR5:** Readers can see suggestion cards appear after every 2nd AI response (#2, #4, #6, #8...)
- **FR6:** Readers can view suggestions on desktop, tablet, and mobile devices with appropriate responsive layouts
- **FR7:** Readers using RTL languages can view suggestions with proper RTL text alignment

### Content Selection & Algorithm

- **FR8:** The system can select 4 random articles from the most recent 10 articles for the same publisher (project_id)
- **FR9:** The system can exclude the current article from suggestions
- **FR10:** The system can filter suggestions by project_id to show only same-publisher content
- **FR11:** The system can display available suggestions when fewer than 4 articles exist (graceful degradation)
- **FR12:** The system can suppress suggestions when 0 articles are available

### User Interaction & Navigation

- **FR13:** Readers can click suggestion cards to navigate to the suggested article
- **FR14:** Readers can open suggested articles in a new browser tab (preserving conversation context)
- **FR15:** Readers can dismiss all suggestions via X button
- **FR16:** Readers can confirm dismissal via confirmation dialog
- **FR17:** Readers can cancel dismissal and keep suggestions visible
- **FR18:** Readers can have suggestions suppressed for the current browser session after confirmed dismissal

### Analytics & Tracking

- **FR19:** The system can track when suggestions are shown to readers (`suggestion_shown` event)
- **FR20:** The system can track when readers click suggestions (`suggestion_clicked` event)
- **FR21:** The system can track when readers click the X dismiss button (`suggestion_x_clicked` event)
- **FR22:** The system can track when readers confirm dismissal (`suggestion_dismissed_confirmed` event)
- **FR23:** The system can track when readers cancel dismissal (`suggestion_dismissed_cancelled` event)
- **FR24:** Analytics managers can view suggestion performance metrics in dashboards
- **FR25:** Analytics managers can view click-through rate (CTR) for suggestions
- **FR26:** Analytics managers can view multi-article session metrics
- **FR27:** Analytics managers can view dismissal rate metrics

### Accessibility & Usability

- **FR28:** Readers using keyboard navigation can tab through suggestion cards
- **FR29:** Readers using keyboard navigation can activate cards with Enter/Space keys
- **FR30:** Readers using keyboard navigation can close dismissal dialog with Escape key
- **FR31:** Readers using screen readers can hear ARIA labels for suggestion cards
- **FR32:** Readers using screen readers can receive announcements when suggestions appear (`aria-live`)
- **FR33:** Readers can see focus indicators on all interactive elements
- **FR34:** Readers can zoom the interface up to 200% without breaking layout

### Visual Design & Presentation

- **FR35:** Readers can see suggestion cards styled to match existing AI message appearance (border, background, spacing)
- **FR36:** Readers can see smooth entrance animations when suggestions appear
- **FR37:** Readers can see "DIVE DEEPER..." label on suggestion cards
- **FR38:** Readers can see suggestion cards with 8px border radius matching AI message styling

### Performance & Technical

- **FR39:** The system can load suggestion feature code in ≤15KB gzipped
- **FR40:** The system can load suggestions without blocking host page rendering
- **FR41:** The system can lazy-load images only when cards are visible
- **FR42:** The system can store dismissal state in sessionStorage (per browser session)
- **FR43:** The system can track conversation state (message counter) to determine suggestion timing

### Error Handling & Degradation

- **FR44:** The system can gracefully degrade when article fetch fails (show available suggestions)
- **FR45:** The system can continue functioning when analytics tracking fails (silent failure)
- **FR46:** The system can log warnings to console for debugging without breaking user experience

## Non-Functional Requirements

### Performance

**Bundle Size:**
- **NFR-P1:** Feature code must be ≤15KB gzipped (hard limit)
- **NFR-P2:** Build process must fail if bundle exceeds 15KB gzipped
- **NFR-P3:** No external dependencies added to widget bundle

**Load Time:**
- **NFR-P4:** Feature must not block host page rendering (asynchronous initialization)
- **NFR-P5:** Suggestion cards must appear within 100ms of AI response render
- **NFR-P6:** Image loading must be lazy (only when cards visible in viewport)

**Runtime Performance:**
- **NFR-P7:** Animations must maintain 60fps on devices with modern browsers
- **NFR-P8:** No layout thrashing or reflows during card rendering
- **NFR-P9:** Memory footprint must be ≤5MB for suggestion feature

**Page Speed Impact:**
- **NFR-P10:** Feature must add ≤50ms to widget initialization time
- **NFR-P11:** Publisher Lighthouse scores must not degrade measurably

### Accessibility (WCAG 2.1 AA Compliance)

**Keyboard Navigation:**
- **NFR-A1:** All interactive elements must be keyboard accessible (Tab, Enter, Space, Escape)
- **NFR-A2:** Focus indicators must be visible with 4.5:1 contrast ratio
- **NFR-A3:** Tab order must follow logical reading order

**Screen Reader Support:**
- **NFR-A4:** All interactive elements must have descriptive ARIA labels
- **NFR-A5:** Suggestion appearance must announce via `aria-live` regions
- **NFR-A6:** Screen readers must announce card count ("Showing 4 suggestions")

**Visual Accessibility:**
- **NFR-A7:** Text contrast must meet 4.5:1 ratio for normal text (WCAG AA)
- **NFR-A8:** Interface must support browser zoom up to 200% without horizontal scrolling
- **NFR-A9:** Color must not be the sole means of conveying information

**Testing:**
- **NFR-A10:** Feature must pass NVDA, JAWS, and VoiceOver screen reader testing
- **NFR-A11:** Feature must pass automated accessibility testing (axe-core or similar)

### Reliability & Stability

**Error Handling:**
- **NFR-R1:** Article fetch failures must not break widget functionality (graceful degradation)
- **NFR-R2:** Analytics tracking failures must not impact user experience (silent failure)
- **NFR-R3:** Image load failures must not break card layout (show placeholder or text-only)

**Browser Compatibility:**
- **NFR-R4:** Feature must function correctly on latest 2 versions of Chrome, Firefox, Safari, Edge
- **NFR-R5:** Unsupported browsers must hide feature without console errors

**Zero Breaking Changes:**
- **NFR-R6:** Feature must not interfere with existing widget functionality
- **NFR-R7:** Feature must not cause console errors on host publisher pages
- **NFR-R8:** Feature toggle (off state) must result in zero code execution

**Uptime & Availability:**
- **NFR-R9:** Feature availability must match existing widget uptime (inherits from PrismAI infrastructure)
- **NFR-R10:** Analytics event tracking must have 99.5% reliability (events captured)

### Browser & Device Compatibility

**Responsive Design:**
- **NFR-C1:** Feature must render correctly on desktop (≥1024px), tablet (768-1023px), and mobile (≤767px)
- **NFR-C2:** Touch targets must be ≥44px on mobile devices
- **NFR-C3:** RTL languages must render with proper text alignment and layout direction

**Testing Coverage:**
- **NFR-C4:** Feature must be tested on iOS Safari (latest 2 versions)
- **NFR-C5:** Feature must be tested on Android Chrome (latest 2 versions)
- **NFR-C6:** Feature must be tested on desktop browsers (Chrome, Firefox, Safari, Edge)
