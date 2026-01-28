---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments:
  - '_bmad-output/suggested-reads-feature-brainstorm.md'
  - '_bmad-output/suggested-reads-card-ux-spec.md'
  - 'product/product.md'
date: '2026-01-27'
author: 'Moshe'
project_name: 'prismai'
feature_name: 'Suggested Reads'
---

# Product Brief: Suggested Reads Feature

## Executive Summary

The Suggested Reads feature transforms PrismAI's Divee.AI chat widget from a single-article engagement tool into a content discovery engine that keeps readers on-site longer. By surfacing relevant article recommendations directly within the chat interface after AI responses, we create a self-sustaining engagement loop: read → chat → discover → read again.

**The Core Problem:** Publishers installing Divee.AI see strong engagement within individual articles, but readers still bounce after finishing. This lost traffic represents missed ad revenue and wasted content inventory - publishers have great articles that go undiscovered.

**The Solution:** In-chat article cards that leverage Divee.AI's high engagement context to drive content discovery. Unlike traditional "related articles" sidebar widgets that get ignored, our suggestions appear at the moment of peak engagement - right after a user interacts with the AI.

**The Impact:** Increased time-on-site, reduced bounce rates, and higher ad revenue per session. Success is measured by suggestion click-through rate per session, directly tied to publisher ROI.

---

## Core Vision

### Problem Statement

Publishers face a content discovery paradox: they invest in quality content and AI engagement tools like Divee.AI, but readers still leave after consuming a single article. The current user journey ends at article completion, forcing readers to manually search for their next piece of content - most simply bounce instead.

### Problem Impact

**For Publishers:**
- **Lost Ad Revenue:** Every bounce is a missed monetization opportunity
- **Underutilized Content:** Deep archives of quality articles go undiscovered
- **Widget ROI Concerns:** If Divee.AI doesn't demonstrably increase time-on-site beyond the initial article, publishers question the investment

**For Readers:**
- Manual navigation friction prevents organic content discovery
- Related article widgets in sidebars are visually ignored (banner blindness)
- No seamless path from "engaged with content" to "discover more content"

**Quantified Risk:** If this problem remains unsolved, publishers won't perceive sufficient value to install or retain the PrismAI widget, threatening product-market fit.

### Why Existing Solutions Fall Short

Traditional "related articles" widgets suffer from three fatal flaws:

1. **Low Engagement Placement:** Sidebars and end-of-article modules are outside the reader's attention flow - they're visually dismissed as ads
2. **Wrong Timing:** Suggestions appear when engagement is lowest (after article completion), not during peak interest
3. **No Context Awareness:** Generic recommendations based on keywords, not on what the reader actually cared enough to ask about

Divee.AI's in-chat environment solves all three: suggestions appear within the primary engagement interface, at moments of active interaction, and (future enhancement) can leverage conversation context to personalize recommendations.

### Proposed Solution

**Suggested Reads Feature:** Contextual article recommendations surfaced as persistent cards within the Divee.AI chat interface, appearing after every 2nd AI response (#2, #4, #6, #8...).

**The Engagement Loop:**
1. Reader finishes article → asks Divee.AI questions
2. After 2nd AI response → suggestion card appears in-chat
3. Reader clicks suggestion → opens new article in new tab (preserves conversation)
4. Reader engages with new article → cycle repeats

**Core Mechanism:** Simple MVP algorithm selects 4 random articles from the publisher's recent 10 articles (same project, excluding current article). Suggestions rotate through the selected 4 using conversation state, ensuring variety without repetition within a session.

**User Control:** Two-step dismissal (X button → confirmation) allows users to suppress suggestions for the session while preventing accidental opt-outs.

### Key Differentiators

**1. High-Engagement Placement**
Unlike sidebar widgets, our suggestions live where readers are already engaged - inside the chat interface they're actively using. This placement leverages Divee.AI's proven engagement superiority over traditional UI patterns.

**2. Strategic Timing**
Suggestions appear during active conversation flow (after every 2nd response), not after engagement ends. This capitalizes on momentum rather than trying to resurrect interest post-bounce.

**3. Future: Conversation-Aware Personalization**
Our unique advantage: access to the reader's actual questions. Future iterations can analyze conversation topics to surface thematically relevant suggestions ("User asked about climate policy → suggest climate articles"), something no sidebar widget can replicate.

**4. Publisher Network Distribution**
PrismAI's existing publisher relationships provide immediate distribution - this isn't a standalone feature, it's an enhancement to a tool publishers already trust and use.

**5. Timing: AI Maturity Meets Cost Efficiency**
AI technology has reached the inflection point where sophisticated features (like future context-aware recommendations) are both technically mature and economically viable. We're building this at exactly the right moment in the AI adoption curve.

---

## Target Users

## Target Users

### Primary Users

**John - The Engaged News Reader**

**Profile:**
- Age: 35
- Occupation: Hitech worker
- Content Pattern: Casual news browsing with curiosity-driven deep dives
- Behavior: Reads articles, asks Divee.AI questions to learn more, wants to continue exploring related topics

**Problem Experience:**

John finishes reading an article and feels intellectually curious but doesn't know where to go next. He wants relevant suggestions but traditional "related articles" sidebars are easy to ignore. When he's engaged enough to ask the AI questions, he's in a discovery mindset - but there's no bridge from "asking questions" to "finding more content to read."

**Current Workaround:**
- Manually searches for related topics (high friction)
- Bounces to Google for follow-up reading (leaves the site)
- Sometimes browses homepage/sections but finds it overwhelming

**Success Vision:**

John sees suggestion cards appear during his conversation with Divee.AI. He doesn't click immediately - the cards register in his mind as "interesting options for later." After he's done asking questions and getting answers, he scrolls back through the chat, spots a suggestion that caught his eye, and clicks it. The article opens in a new tab (preserving his current conversation), and he continues his reading journey. Success = John stays on-site, discovers content he wouldn't have found otherwise, and feels like the site "gets" what he's interested in.

**What Makes John Click:**
- Relevance: Title signals it's related to what he was just reading/asking about
- Timing: Suggestion appears when he's actively engaged, not after he's mentally checked out
- Trust: It's part of the Divee.AI interface he's already using, not an intrusive ad

---

### Secondary Users

**Sarah - Analytics Manager at News Publisher**

**Profile:**
- Role: Analytics Manager at medium-to-large news organization
- Goals: Increase time-on-site, boost ad impressions, validate content quality
- Metrics Obsession: Bounce rate, session duration, pages per session, ad CTR

**Problem Experience:**

Sarah sees readers engage deeply with individual articles (thanks to Divee.AI), but they still bounce after one piece of content. She knows the publisher has a deep archive of quality articles, but readers aren't discovering them. Every bounce represents lost ad revenue and wasted content investment. She needs proof that new features like Divee.AI aren't just engagement theater - they need to drive measurable business outcomes.

**Success Vision:**

Sarah discovers the Suggested Reads feature by seeing new metrics appear in her analytics dashboard:
- Suggestion impression count
- Suggestion click-through rate (CTR)
- Sessions with multi-article navigation via suggestions
- Time-on-site increase for users who click suggestions

**Success Moment:** When Sarah sees data proving that users are leveraging the widget to navigate the site and read more content than they would have without it. Specifically: higher pages-per-session for users who interact with suggestions, and measurable time-on-site lift. This validates both content quality (readers want more) and widget ROI (tool drives retention).

**Decision Influence:**

While Sarah doesn't directly decide to install PrismAI features (that's a product/executive decision), her metrics reports directly influence renewal and expansion decisions. Positive data from Suggested Reads becomes ammunition for budget approval and feature adoption across more publisher properties.

---

### User Journey

**John's Journey (Primary User - Reader):**

1. **Discovery:** John is reading a news article with Divee.AI widget. He asks the AI a question about something in the article → After his 2nd exchange with the AI (response #2), a suggestion card appears in the chat stream

2. **Mental Registration:** John sees the suggestion card but doesn't immediately click. He's still focused on his current line of questioning. The card remains visible in the chat history, registering as "something interesting for later"

3. **Continued Engagement:** John asks more questions (responses #3, #4...). At response #4, another suggestion appears. Now he has 2 options visually persisted in his chat history

4. **Success Moment - The Scroll-Back Click:** John finishes his questions. Instead of bouncing, he scrolls back up through the conversation and spots a suggestion that caught his eye earlier. He clicks it → Article opens in new tab, preserving his current Divee.AI conversation

5. **Long-term Behavior:** Over time, John learns that interesting suggestions appear during his Divee.AI sessions. He trusts them because they're part of an interface he already finds valuable. The suggestions become an expected, welcomed part of his reading experience

**Sarah's Journey (Secondary User - Analytics Manager):**

1. **Discovery:** Sarah sees new metrics in her analytics dashboard: "Suggested Reads Impressions," "Suggested Reads CTR," "Multi-article Sessions via Suggestions"

2. **Validation Phase:** She monitors the data for 2-4 weeks to see patterns: Are users clicking? Are click-through rates healthy? Is time-on-site increasing for users who engage with suggestions?

3. **Success Moment:** Sarah runs a cohort analysis and sees that users who click at least one suggestion have 40% higher session duration and read 2.1 articles per session (vs 1.3 for non-clickers). This is the proof point she needs

4. **Advocacy:** Sarah includes Suggested Reads data in her quarterly executive report, highlighting it as a key driver of engagement improvement. The feature becomes part of the business case for continued PrismAI investment

---

## Success Metrics

### User Success Metrics (John's Perspective)

**Primary Outcome:** John stays engaged longer and discovers content he wouldn't have found otherwise.

**Behavioral Indicators of Success:**

1. **Suggestion Click-Through Rate (CTR)**
   - **Measurement:** % of sessions where user clicks at least one suggestion
   - **Success Hypothesis:** 10-15% CTR indicates healthy engagement (1 in 7-10 sessions results in content discovery)
   - **Validation:** Track CTR over first 30 days to establish baseline, then iterate

2. **Bounce Rate Reduction**
   - **Measurement:** % decrease in single-article sessions among users who see suggestions
   - **Success Hypothesis:** 15-25% reduction in bounce rate for users who interact with Divee.AI
   - **Target Behavior:** Users read 2+ articles per session instead of bouncing after 1

3. **Multi-Article Sessions**
   - **Measurement:** Average articles read per session for users exposed to suggestions
   - **Success Hypothesis:** Increase from ~1.3 articles/session (baseline) to 2.0+ articles/session
   - **Quality Signal:** Users who click suggestions return for future sessions (indicates trust in recommendations)

**User Satisfaction Signal:**
- Users scroll back to click suggestions (indicates mental registration and deferred discovery pattern works)
- Low dismissal rate (<5% of users permanently suppress suggestions)
- Repeat engagement with suggestions in subsequent sessions

---

### Business Objectives

**3-Month Success Criteria:**

1. **Feature Adoption & Validation**
   - Successfully deployed to initial publisher cohort (5-10 publishers)
   - Baseline data collected showing measurable CTR and engagement lift
   - Zero critical bugs or user complaints about intrusive UX

2. **Publisher Value Demonstration**
   - Analytics dashboards showing suggestion impressions, CTR, and multi-article session rates
   - At least 2 publishers report positive feedback on time-on-site metrics
   - Data package ready for sales team to demonstrate feature value to prospects

3. **Technical Foundation**
   - MVP algorithm (4 random from recent 10) performing adequately
   - Analytics infrastructure tracking all 5 core events (shown, clicked, x_clicked, dismissed_confirmed, dismissed_cancelled)
   - System handling production load without performance degradation

**12-Month Success Criteria:**

1. **Market Positioning Achievement**
   - **Strategic Goal:** PrismAI is recognized as "the only AI chat widget with in-chat content discovery"
   - Competitive differentiation established in sales materials and customer testimonials
   - Feature becomes part of standard pitch: "Divee.AI doesn't just engage readers—it keeps them on your site"

2. **Publisher Retention & Expansion**
   - Suggested Reads contributes to measurable publisher satisfaction and renewal rates
   - Feature becomes upgrade/upsell opportunity for publishers not yet using it
   - New publisher acquisitions cite content discovery as a key decision factor

3. **Foundation for V2 Enhancement**
   - Data collected on conversation topics enables future context-aware recommendations
   - User behavior patterns inform algorithm improvements beyond random selection
   - Product roadmap includes conversation-aware personalization based on MVP learnings

---

### Key Performance Indicators (KPIs)

**Primary KPIs (Track Weekly):**

1. **Suggestion CTR**
   - **Formula:** (Sessions with ≥1 click) / (Sessions with ≥1 impression) × 100%
   - **Target Range:** 10-20% (validate through early data)
   - **Red Flag:** <5% sustained over 2+ weeks indicates poor relevance or UX issues

2. **Multi-Article Session Rate**
   - **Formula:** (Sessions with 2+ articles read) / (Total sessions) × 100%
   - **Target:** Increase baseline multi-article rate by 30-50%
   - **Success Signal:** Users clicking suggestions have 2-3x higher multi-article rate than non-clickers

3. **Time-on-Site Lift**
   - **Formula:** Avg session duration for users who click suggestions vs those who don't
   - **Target:** 40-60% higher session duration for suggestion-clickers
   - **Business Impact:** Directly correlates to ad impression opportunities for publishers

**Secondary KPIs (Track Monthly):**

4. **Dismissal Rate**
   - **Formula:** (Sessions with confirmed dismissal) / (Sessions with impressions) × 100%
   - **Target:** <5% (low dismissal indicates non-intrusive UX)
   - **Warning Signal:** >10% suggests timing/frequency tuning needed

5. **Publisher Satisfaction**
   - **Measurement:** Quarterly surveys + qualitative feedback from analytics managers
   - **Target:** 80%+ of publishers rate feature as "valuable" or "very valuable"
   - **Validation:** Publishers include suggestion data in internal reports

6. **Repeat Engagement**
   - **Formula:** % of users who click suggestions in multiple sessions (returning users)
   - **Target:** 30%+ of suggestion-clickers engage again in future sessions
   - **Success Signal:** Behavior becomes habit, not novelty

**Leading Indicators (Predict Long-Term Success):**

- **Early CTR Trend:** First-week CTR predicts long-term engagement patterns
- **Card Visibility Time:** Time suggestion cards remain visible in viewport (indicates users notice them)
- **Scroll-Back Behavior:** % of clicks that occur after scrolling back (validates "mental registration" hypothesis)

---

### Metric-to-Strategy Alignment

**How Metrics Connect to Product Vision:**

| User Success Metric | Drives → | Business Outcome |
|---------------------|----------|-------------------|
| 10-15% CTR | → | Validates high-engagement placement hypothesis |
| 15-25% bounce reduction | → | Increases ad revenue per session for publishers |
| 2.0+ articles/session | → | Demonstrates content discovery value, improves publisher ROI |
| <5% dismissal rate | → | Confirms non-intrusive UX, reduces churn risk |
| Market positioning | → | Competitive advantage in AI widget market |

**Avoiding Vanity Metrics:**
- We track **clicks** (action), not just **impressions** (visibility)
- We measure **multi-article sessions** (outcome), not just **time-on-site** (activity)
- We validate **publisher ROI** (business value), not just **feature usage** (adoption)

---

## MVP Scope

### Core Features (Version 1.0)

**1. In-Chat Suggestion Cards**
- **Placement:** Suggestion cards appear as persistent messages within the Divee.AI chat stream
- **Timing:** After every 2nd AI response (#2, #4, #6, #8...)
- **Persistence:** Cards remain visible in chat history (users can scroll back to find them)

**2. Simple Selection Algorithm**
- **Logic:** Random selection of 4 articles from publisher's most recent 10 articles
- **Filters:** Same project_id, exclude current article
- **Rotation:** Conversation-state counter ensures variety (rotate through selected 4)
- **Graceful Degradation:** Show available articles if < 4, suppress entirely if 0

**3. Minimal Card Design**
- **Components:** Featured image (80px width, full height) + article title + "DIVE DEEPER..." label
- **Styling:** Match AI message border/background, 8px border-radius, horizontal layout
- **Text Truncation:** Title limited to 3 lines with ellipsis
- **RTL Support:** Text alignment and entrance animation respect language direction
- **Clickable:** Entire card is clickable target

**4. Click Behavior**
- **Action:** Opens article in new tab (preserves current conversation)
- **Navigation:** New page load with fresh Divee.AI instance on target article

**5. User Control - Two-Step Dismissal**
- **Step 1:** X button (top-right corner, 20x20px, touch-friendly)
- **Step 2:** Confirmation prompt transforms card: "Don't show suggestions in this chat?"
- **Options:** "Yes, hide them" (confirms) | "Cancel" (returns to suggestion)
- **Suppression:** sessionStorage flag prevents future suggestions for this session only
- **Reset:** New session = suggestions reappear (no permanent user-level opt-out in MVP)

**6. Analytics Foundation**
- **Events Tracked:**
  - `suggestion_shown` - Card impression in chat
  - `suggestion_clicked` - User clicks suggestion
  - `suggestion_x_clicked` - User clicks X button
  - `suggestion_dismissed_confirmed` - User confirms "Yes, hide them"
  - `suggestion_dismissed_cancelled` - User clicks "Cancel"
- **Infrastructure:** Event logging to analytics system, queryable by conversation_id, project_id, article_id
- **Dashboard Metrics:** CTR, impressions, dismissal rate (viewable by publishers)

---

### Out of Scope for MVP

**Explicitly NOT included in Version 1.0:**

1. **Context-Aware Recommendations (V2 Feature)**
   - No analysis of conversation topics to personalize suggestions
   - No semantic matching between user questions and article content
   - **Rationale:** Requires conversation processing infrastructure; simple random selection validates core UX first

2. **Publisher Admin Controls (Future Enhancement)**
   - No publisher-facing settings for timing, frequency, or algorithm tuning
   - No ability to exclude specific articles from suggestions pool
   - No A/B testing framework for publishers
   - **Rationale:** Learn optimal defaults from MVP data before exposing controls; reduces implementation complexity

3. **Advanced Algorithm Features (V2+)**
   - No machine learning-based recommendations
   - No collaborative filtering ("readers who liked X also liked Y")
   - No topic clustering or content similarity scoring
   - **Rationale:** Validate user behavior with simple algorithm before investing in ML infrastructure

4. **Complex Image Handling (Simplified for MVP)**
   - No sophisticated fallback strategies for missing images (simple placeholder or skip card)
   - No image optimization/CDN integration beyond what exists
   - No custom aspect ratio handling
   - **Rationale:** Focus on core UX; image quality refinements can iterate post-launch

5. **Cross-Session Personalization (Future)**
   - No user profiles or reading history tracking
   - No "You recently read..." or "Continue reading..." features
   - **Rationale:** Privacy considerations and infrastructure complexity; session-only state keeps MVP simple

6. **Multi-Language Content Matching (V2)**
   - No automatic language detection/matching between article and suggestions
   - Assumes publisher articles are in same language within a project
   - **Rationale:** Edge case that can be addressed post-launch if needed

**Scope Protection:**
- Any requests for features above require formal V2 scoping conversation
- MVP success metrics must validate before expanding scope
- "No" to feature requests unless they directly block core value delivery

---

### MVP Success Criteria

**Go/No-Go Decision Points:**

**After 30 Days (Initial Validation):**
- **Go Signal:**
  - Suggestion CTR ≥ 8% (indicates users engaging with feature)
  - Dismissal rate ≤ 7% (confirms non-intrusive UX)
  - Zero P0/P1 bugs reported by publishers
  - At least 1 publisher reports positive time-on-site lift
  
- **Iterate Signal:**
  - CTR 5-8% (feature working but needs tuning)
  - Adjust timing (every 3rd response instead of 2nd?) or card design
  
- **Kill Signal:**
  - CTR < 3% sustained (users ignoring suggestions)
  - Dismissal rate > 15% (users find it annoying)
  - Publishers report negative feedback

**After 90 Days (Scale Decision):**
- **Scale to All Publishers:**
  - CTR ≥ 10% sustained
  - Multi-article session rate increase ≥ 30%
  - 3+ publishers actively promoting feature value internally
  - Technical infrastructure stable under production load
  
- **Invest in V2:**
  - MVP metrics validate core concept
  - Publisher demand for context-aware recommendations
  - Engineering capacity available for ML features

**Data Requirements for V2 Planning:**
- Minimum 10,000 suggestion impressions across 5+ publishers
- User behavior patterns documented (scroll-back clicks, timing preferences)
- Qualitative feedback from 10+ readers and 5+ analytics managers

---

### Future Vision

**Version 2.0 - Context-Aware Personalization (6-12 Months Post-MVP)**

**Core Enhancement: Conversation-Aware Recommendations**
- Analyze user questions to understand topic interests ("user asked about climate policy → suggest climate articles")
- Semantic matching between conversation topics and article content
- Priority scoring: combine recency + topic relevance + publisher-defined weights

**Implementation Foundation:**
- Leverage conversation data already collected by Divee.AI
- Topic extraction using LLM analysis of user questions
- Build content taxonomy/tagging for publisher article libraries

**Business Impact:**
- Increase CTR from ~10-15% (MVP) to 20-25% (personalized recommendations)
- Strengthen competitive moat (no sidebar widget can replicate conversation context)
- Unlock premium pricing tier for publishers wanting advanced recommendations

---

**Version 3.0 - Publisher Control & Optimization Platform (12-18 Months)**

**Admin Dashboard for Publishers:**
- Configure suggestion timing (every 2nd, 3rd, or 4th response)
- Set article eligibility rules (exclude categories, set recency windows)
- A/B test different algorithms or card designs
- View detailed analytics by article, time period, user segment

**Advanced Features:**
- Cross-article journey visualization (see how users navigate via suggestions)
- Predictive scoring: "This article likely generates 25% more suggestions clicks than average"
- Integration with publisher CMS for automatic content tagging

**Business Model Evolution:**
- Tiered pricing: Basic (MVP features) → Pro (context-aware) → Enterprise (full control)
- Feature becomes core differentiator in publisher sales conversations

---

**Long-Term Vision (2-3 Years)**

**Ecosystem Expansion:**
- **Multi-Publisher Network:** Cross-site recommendations for publisher networks (Politico → Axios if both use PrismAI)
- **Reader Profiles:** Opt-in user accounts with reading history and preferences (privacy-first)
- **Content Marketplace:** Publishers discover high-performing content strategies from anonymized network data

**Platform Play:**
- Suggested Reads becomes foundational engagement layer
- Other features build on this: "Save for Later," "Share This," "Subscribe to Topic"
- PrismAI evolves from "chat widget" to "content engagement platform"

**Market Position:**
- Industry standard for AI-powered content discovery
- "Every publisher with PrismAI sees 40%+ higher session duration" becomes the positioning
- Feature set that's economically unfeasible for competitors to replicate without comparable publisher network

---
