# Suggested Reads Feature - Brainstorming Session

**Facilitator:** Mary (Business Analyst)  
**Participant:** Moshe  
**Date:** 2026-01-27  
**Project:** PrismAI/Divee.AI Widget  
**Session Duration:** ~45 minutes  

---

## Session Overview

### Challenge
Design and architect a "suggested reads" feature for the PrismAI chat widget that recommends relevant articles from the same publisher's site after AI responses, keeping readers engaged and on-site longer.

### Goals
- **Primary Focus:** UI/UX design and user experience
- **Comprehensive Scope:** Recommendation logic, data sourcing, interaction patterns, analytics, and publisher controls
- **Business Impact:** Increase time-on-site, reduce bounce rate, create engagement loop

### Approach Used
- **SCAMPER Method** (focused on Substitute lens with deep dive)
- **Role Playing** (User persona: Sarah - Busy Reader; Publisher persona: David - Managing Editor)
- Iterative refinement through stakeholder validation

---

## Complete Idea Inventory

### THEME 1: User Experience & Interface Design

#### #1 - In-Chat Persistent Card Placement
**Concept:** Suggested reading cards appear as separate messages in the chat stream (not in the ephemeral suggestion dropdown). Cards remain visible in chat history, allowing users to scroll back to find any suggestion at any time.

**Why This Works:**
- Solves ephemeral suggestion problem (dropdown disappears after interaction)
- Respects user mental model (messages = persistent, overlays = temporary)
- Enables discovery at user's pace

**Implementation:** Insert card component into chat message array after specific response numbers.

---

#### #2 - Minimal Card Design (3 Core Elements)
**Concept:** Clean, compact card with only essential information:
1. "Dive deeper..." label (brand-aligned!)
2. Article thumbnail/featured image
3. Article title

Whole card is clickable. No clutter, no description text, no metadata.

**Why This Works:**
- Respects user attention in small space
- Visual (thumbnail) + text (title) = sufficient context
- "Dive deeper" reinforces Divee.AI brand identity
- Authenticity: uses native article assets (no custom creation needed)

**Design Notes:** Rounded corners for friendliness, subtle shadow/border for lift, proper whitespace for breathing room.

---

#### #3 - Even-Response Cadence
**Concept:** Suggestion cards appear after AI responses #2, #4, #6, #8, #10, etc.

**Timing Logic:**
```
User: Question 1
AI: Response #1 ← No suggestion
User: Question 2  
AI: Response #2 ← SHOW SUGGESTION
User: Question 3
AI: Response #3 ← No suggestion
User: Question 4
AI: Response #4 ← SHOW SUGGESTION
```

**Why This Works:**
- Not too frequent (avoids feeling pushy - validated by User persona)
- Not too sparse (maintains discovery momentum)
- Early enough (suggestion #1 appears after just 2 exchanges)
- Clean pattern (easy to implement and debug)

---

#### #4 - Two-Step Dismissal with Confirmation
**Concept:** User control mechanism to suppress suggestions:

**Step 1:** Click X button on card  
**Step 2:** Card transforms to show: "Don't show suggestions in this chat? (You'll miss related articles)" with two buttons:
- "Yes, hide them" (primary action)
- "Cancel" (secondary/ghost button)

**Behavior:**
- If Cancel → card returns to normal suggestion
- If Confirm → card disappears + all future cards suppressed for this session (sessionStorage flag)

**Why This Works:**
- Prevents accidental dismissals (fat-finger clicks)
- Gentle retention (reminds value without manipulation)
- Respects user autonomy (choice over experience)
- Analytics-rich (track intent vs confirmation separately)

**Discovery:** Uncovered through role-playing as "Sarah" (busy reader) who found suggestions potentially annoying/intrusive.

---

### THEME 2: Interaction & Navigation

#### #5 - New Tab Navigation
**Concept:** Clicking suggestion card opens article in new browser tab. Original tab (with chat widget) remains open and active.

**Why This Works:**
- Preserves conversation context (users can continue chatting)
- Best of both worlds (explore new content without losing current state)
- Standard web pattern (users understand behavior)

**Alternative Considered & Rejected:**
- Same-tab navigation (loses chat context)
- Inline preview modal (adds complexity for MVP)
- Device-specific behavior (inconsistent experience)

---

#### #6 - Comprehensive Analytics Tracking
**Concept:** Track 5 key events to measure engagement and improve recommendations:

**Events:**
1. `suggestion_shown` - Card appeared (baseline denominator)
2. `suggestion_clicked` - User clicked to open article (success metric!)
3. `suggestion_x_clicked` - User clicked X button (dismissal intent)
4. `suggestion_dismissed_confirmed` - User confirmed dismissal (true opt-out)
5. `suggestion_dismissed_cancelled` - User cancelled dismissal (false alarm)

**Derived Metrics:**
- **Engagement Rate:** `suggestion_clicked / suggestion_shown`
- **Dismissal Intent Rate:** `suggestion_x_clicked / suggestion_shown`
- **Actual Dismissal Rate:** `suggestion_dismissed_confirmed / suggestion_shown`
- **Accidental Click Rate:** `suggestion_dismissed_cancelled / suggestion_x_clicked`

**Why This Works:**
- Product intelligence for optimization
- Feedback loop for recommendation quality
- Distinguish between accidental and intentional behaviors
- Inform future algorithm improvements

**Payload:** Include `article_id`, `position_in_chat`, `conversation_id`, `project_id`, `visitor_id`, `session_id`

---

### THEME 3: Backend Selection Logic (MVP)

#### #7 - Random 4 from Recent 10 Algorithm
**Concept:** MVP recommendation logic balancing simplicity, variety, and freshness:

**Query:**
```sql
SELECT * FROM article 
WHERE project_id = ? 
  AND url != ? 
ORDER BY created_at DESC 
LIMIT 10
```

**Selection:** Randomly pick 4 articles from this pool of 10.

**Why This Works:**
- **Variety:** Random selection reduces topic clustering (vs pure "4 most recent")
- **Freshness:** Limited to 10 most recent (vs full catalog)
- **Performance:** Single query + in-memory randomization (vs analytics aggregation)
- **Publisher-Validated:** Addresses David's concerns about topic repetition

**Evolution:** Originally "4 most recent" → "4 random from 20" → final "4 random from 10" (tighter recency window).

---

#### #8 - Smart Filtering Rules
**Concept:** Filter rules to prevent bad UX:

**Filters:**
1. **Same project only:** `project_id = ?` (only suggest from same publisher)
2. **Exclude current article:** `url != ?` (don't suggest what user is reading)

**Edge Case Handling:**
- If < 4 articles available: Show what exists and loop naturally
- If 0 articles available: Suppress suggestion cards entirely (no broken UI)

**Why This Works:**
- Prevents confusing/frustrating experiences
- Graceful degradation for new sites with minimal content
- Scales from Day 1 (sparse catalog) to Year 3 (massive catalog)

---

#### #9 - Conversation-State Round Robin
**Concept:** Maintain `suggestion_index` counter in `conversations` table to rotate through the 4 selected articles:

**Logic:**
```javascript
// On suggestion display:
const articles = getRandomFourFromRecentTen(projectId, currentUrl);
const position = conversation.suggestion_index % articles.length;
const suggestionToShow = articles[position];

// Increment counter
conversation.suggestion_index += 1;
```

**Example Flow (3 articles available):**
- Suggestion #1: Show article[0]
- Suggestion #2: Show article[1]
- Suggestion #3: Show article[2]
- Suggestion #4: Loop back to article[0]
- Suggestion #5: Show article[1]
- ...continues

**Why This Works:**
- Guarantees variety within available pool
- Stateful (remembers what user has seen)
- Simple modulo math (% operator)
- Scales to any article count (even 1 article loops)

**Schema Addition:**
```sql
ALTER TABLE conversations 
ADD COLUMN suggestion_index INTEGER DEFAULT 0;
```

---

### THEME 4: Publisher Controls & Future Enhancements

#### #10 - Article Blacklist Feature (Deferred to v2)
**Concept:** Allow publishers to exclude specific articles from suggestions via `excluded_from_suggestions` boolean flag on article table.

**Use Cases:**
- Outdated/incorrect information
- Controversial/sensitive topics
- Paywalled content that frustrates users
- Competitor mentions or negative coverage
- Draft articles accidentally published

**Why Deferred:**
- MVP validation first (does core feature work?)
- Avoid over-engineering for unvalidated needs
- Gather real publisher feedback before building controls
- Simple algorithm sufficient for launch

**Discovery:** Identified through role-playing as "David" (Managing Editor) concerned about editorial quality.

---

## Breakthrough Concepts

### 🌟 "Dive deeper..." Brand Integration
**Insight:** Feature copy that reinforces brand identity (Divee.AI → "Dive deeper").

**Impact:** Every suggestion card becomes a brand touchpoint. Subtle but powerful alignment between product name and user action.

---

### 🌟 Two-Step Dismissal Pattern
**Insight:** Balance user control (X button) with gentle retention (confirmation message).

**Impact:** Prevents impulsive opt-outs while respecting user agency. Not manipulative ("Are you SURE?!") but informative.

---

### 🌟 Role-Play Validation Method
**Insight:** Embodying "Sarah" (busy reader) revealed critical UX gap (need for dismissal option) that design review missed.

**Impact:** Stakeholder perspective-taking = faster discovery of hidden requirements than abstract analysis alone.

---

### 🌟 Algorithm Evolution Through Publisher Lens
**Insight:** "4 most recent" → "random 4 from 10" emerged from David's concern about topic clustering.

**Impact:** Publisher validation improved algorithm without adding complexity. Sweet spot between simple and smart.

---

## Prioritization Results

### ✅ MVP SCOPE (Ship First)

**High Priority - Implementation Ready:**

1. **In-chat persistent cards** (Theme 1, Ideas #1-4)
   - Visual design fully spec'd
   - Interaction patterns validated
   - Dismissal flow designed
   
2. **Random 4 from Recent 10 algorithm** (Theme 3, Ideas #7-9)
   - Simple query logic
   - Smart filtering rules
   - Round-robin tracking

3. **New tab navigation + analytics** (Theme 2, Ideas #5-6)
   - Standard pattern (low risk)
   - 5-event tracking framework
   - Product intelligence foundation

**Why This MVP Works:**
- Fully functional feature
- No dependencies on complex systems
- Validated through role-play
- Analytics for iteration

---

### 🚀 POST-MVP (Future Iterations)

**Deferred Features:**

1. **Article blacklist controls** (Theme 4, Idea #10)
   - Wait for real publisher feedback
   - Validate need before building

2. **AI-powered semantic matching**
   - Current: Random from recent = good enough
   - Future: Content embeddings + similarity scoring
   - Requires: Article corpus processing infrastructure

3. **Popularity-based ranking**
   - Current: Recency bias acceptable for MVP
   - Future: "Most read this week" hybrid approach
   - Requires: Analytics aggregation pipeline

---

## Action Plan

### WEEK 1: Backend Foundation

**Database Schema:**
```sql
-- Add to conversations table:
ALTER TABLE conversations 
ADD COLUMN suggestion_index INTEGER DEFAULT 0;
```

**Edge Function: `/api/v1/get-suggested-articles`**

**Input:**
```json
{
  "projectId": "proj_xxx",
  "currentArticleUrl": "https://...",
  "conversationId": "uuid",
  "suggestionIndex": 3
}
```

**Logic:**
1. Query: `SELECT * FROM article WHERE project_id = ? AND url != ? ORDER BY created_at DESC LIMIT 10`
2. If count = 0: Return `{suggestions: []}`
3. Randomly select 4 from results
4. Calculate position: `suggestionIndex % article_count`
5. Return article at position

**Output:**
```json
{
  "suggestion": {
    "unique_id": "art_xxx",
    "url": "https://...",
    "title": "Article Title",
    "image_url": "https://..."
  }
}
```

**Testing:**
- [ ] Test with 0 articles (empty array)
- [ ] Test with 1-3 articles (looping behavior)
- [ ] Test with 10+ articles (full pool)
- [ ] Verify current article excluded
- [ ] Verify same project_id filter

---

### WEEK 2: Frontend Implementation

**Component: `SuggestedReadCard.jsx` (or vanilla JS)**

**Props:**
- `article` (url, title, image_url)
- `onDismiss` (callback)
- `onClick` (analytics tracking)

**Structure:**
```html
<div class="divee-suggested-read-card">
  <button class="dismiss-btn">×</button>
  <a href="{article.url}" target="_blank" class="card-link">
    <div class="label">Dive deeper...</div>
    <img src="{article.image_url}" alt="{article.title}" />
    <h4>{article.title}</h4>
  </a>
</div>

<!-- After X clicked: -->
<div class="divee-dismiss-confirmation">
  <p>Don't show suggestions in this chat? (You'll miss related articles)</p>
  <button class="btn-primary">Yes, hide them</button>
  <button class="btn-ghost">Cancel</button>
</div>
```

**State Management:**
- SessionStorage: `divee_suggestions_suppressed_{conversationId}` (boolean)
- Check before rendering any card
- Set on confirmed dismissal

**Rendering Logic:**
```javascript
// In chat message rendering loop:
if (messageIndex === 2 || messageIndex === 4 || messageIndex === 6 || messageIndex === 8) {
  const suppressed = sessionStorage.getItem(`divee_suggestions_suppressed_${conversationId}`);
  if (!suppressed) {
    renderSuggestedReadCard(conversationId, messageIndex);
  }
}
```

**Testing:**
- [ ] Desktop rendering (card spacing, hover states)
- [ ] Mobile responsive (image scaling, touch targets)
- [ ] Two-step dismissal flow (X → confirm → suppress)
- [ ] Cancellation flow (X → cancel → restore card)
- [ ] New tab opening (verify target="_blank")
- [ ] SessionStorage persistence across page refreshes

---

### WEEK 3: Analytics Integration

**Events to Implement:**

```javascript
// 1. Card shown
trackEvent('suggestion_shown', {
  article_id: suggestion.unique_id,
  position: messageIndex,
  conversation_id: conversationId
});

// 2. Card clicked
trackEvent('suggestion_clicked', {
  article_id: suggestion.unique_id,
  position: messageIndex,
  conversation_id: conversationId
});

// 3. X button clicked
trackEvent('suggestion_x_clicked', {
  article_id: suggestion.unique_id,
  position: messageIndex,
  conversation_id: conversationId
});

// 4. Dismissal confirmed
trackEvent('suggestion_dismissed_confirmed', {
  article_id: suggestion.unique_id,
  position: messageIndex,
  conversation_id: conversationId
});

// 5. Dismissal cancelled
trackEvent('suggestion_dismissed_cancelled', {
  article_id: suggestion.unique_id,
  position: messageIndex,
  conversation_id: conversationId
});
```

**Dashboard Metrics (Future):**
- Engagement rate by project
- Top clicked articles
- Dismissal rate trends
- Position performance (are later suggestions ignored?)

---

### WEEK 4: Testing & Refinement

**Test Scenarios:**

**Edge Cases:**
- [ ] New site with 0 articles → No cards shown, no errors
- [ ] Site with 1 article → Same article loops (but excluded if current)
- [ ] Site with 2-3 articles → Proper looping through small pool
- [ ] Rapid conversation (10+ messages) → Suggestions appear correctly

**User Flows:**
- [ ] Happy path: See suggestion → Click → Open new tab
- [ ] Dismissal path: See suggestion → X → Confirm → No more suggestions
- [ ] Accidental dismissal: See suggestion → X → Cancel → Suggestion restored
- [ ] Scroll back: Past suggestions remain visible and clickable

**Performance:**
- [ ] Query performance with large article tables (10k+ articles)
- [ ] Random selection performance (in-memory shuffling)
- [ ] Card rendering performance (image loading, lazy loading?)

---

## Success Metrics

### Engagement Metrics (Track Weekly)

**Primary:**
- **Click-Through Rate (CTR):** `suggestion_clicked / suggestion_shown`
  - Target: >5% (baseline to beat)
  - Excellent: >10%

**Secondary:**
- **Dismissal Rate:** `suggestion_dismissed_confirmed / suggestion_shown`
  - Target: <20% (most users don't find it annoying)
  - Warning: >30% (feature may be too intrusive)

- **Accidental Dismissal Rate:** `suggestion_dismissed_cancelled / suggestion_x_clicked`
  - Expected: 20-40% (two-step confirmation is working)

### Business Impact Metrics (Month-over-Month)

**Engagement:**
- Articles per session (before vs after feature)
- Session duration increase
- Pages per visitor increase

**Retention:**
- Bounce rate reduction
- Return visitor rate
- Widget re-engagement rate (users who return to widget on new articles)

### Quality Indicators

**Position Analysis:**
- CTR by position (#2 vs #4 vs #6 vs #8)
- Identify if later suggestions are ignored (fatigue)

**Article Performance:**
- Which articles get highest CTR when suggested?
- Are recent articles performing better than older ones?
- Topic clustering detection (same category = lower CTR?)

---

## Session Insights

### Key Learnings

1. **Role-playing reveals hidden requirements faster than abstract design review**
   - Sarah (user) → discovered dismissal need
   - David (publisher) → improved algorithm variety

2. **MVP discipline prevents over-engineering**
   - Deferred blacklist feature (unvalidated need)
   - Simple > perfect for launch

3. **Brand consistency opportunities exist in micro-copy**
   - "Dive deeper..." = brand reinforcement
   - Feature becomes marketing touchpoint

4. **Two-step patterns balance control with retention**
   - X button alone = too easy to accidentally dismiss
   - Confirmation message = gentle value reminder without manipulation

5. **Analytics design matters from Day 1**
   - 5-event framework enables sophisticated analysis
   - Distinguish intent (x_clicked) from confirmation (dismissed_confirmed)

---

## Creative Process Reflection

### What Worked Well

**SCAMPER "Substitute" Lens:**
- Forced us to think about replacing existing elements (suggestion dropdown → in-chat cards)
- Led to persistent vs ephemeral insight

**Deep Dive Approach:**
- Rather than breadth across all SCAMPER lenses, going deep on Substitute + interaction details produced actionable specs
- Moshe's instinct to go deep (Option D) was correct

**Role Playing Technique:**
- Embodying specific personas (Sarah, David) surfaced concerns abstract design wouldn't catch
- Made stakeholder conflicts tangible and resolvable

**Iterative Refinement:**
- Algorithm evolved: "4 recent" → "4 random from 20" → "4 random from 10"
- Each iteration addressed specific concern without adding complexity

### Facilitator Observations

**Moshe's Creative Strengths:**
- **Decisive:** Clear choices when presented with options (New Tab, Option B, etc.)
- **MVP-minded:** Consistently chose simplicity over perfection ("Leave it out of MVP")
- **User-centric:** Immediately connected with Sarah's frustration about intrusive UX
- **Practical:** Focused on what's implementable now vs theoretical perfect solution

**Session Energy:**
- High engagement throughout
- Quick progression through decisions (efficient use of time)
- Balance of exploration (ideation) and convergence (spec'ing details)

---

## Next Steps

### Immediate (This Week)
1. ✅ **Review this document** - Ensure all specs align with team understanding
2. **Share with team** - Get engineering + design feedback on feasibility
3. **Create tickets** - Break action plan into trackable implementation tasks
4. **Design mockups** - Visual designer creates card variations for review

### Short-Term (Weeks 2-4)
1. **Implement backend** - Edge function + DB schema changes
2. **Implement frontend** - Card component + chat integration
3. **Wire analytics** - 5-event tracking framework
4. **QA testing** - Edge cases + user flows

### Long-Term (Post-Launch)
1. **Monitor metrics** - Weekly CTR, dismissal rate, business impact
2. **Gather feedback** - Publisher and user reactions
3. **Iterate** - Adjust cadence, design, algorithm based on data
4. **Plan v2** - Blacklist controls? AI-powered recommendations? A/B tests?

---

## Conclusion

**This session transformed a vague concept ("suggested reads feature") into a production-ready specification in under an hour.**

**What We Achieved:**
- ✅ Complete UX design (placement, visual, interaction, dismissal flow)
- ✅ Backend algorithm (random 4 from recent 10 with smart filtering)
- ✅ Analytics framework (5 events, derived metrics)
- ✅ Edge case handling (sparse catalogs, zero articles)
- ✅ Stakeholder validation (user + publisher perspectives)
- ✅ Implementation roadmap (4-week action plan)

**Why This Matters:**
This feature creates an **engagement loop** that tackles PrismAI's core problem: readers "read & run." By suggesting related content at natural conversation breaks, we:
- Keep readers on-site longer
- Increase pages per session
- Create discovery moments without intrusive popups
- Build publisher value (more engaged readers = better metrics)

**The MVP is shippable, measurable, and improvable.** Ship it, learn from it, iterate on it. 🚀

---

**Session Completed:** 2026-01-27  
**Total Ideas Generated:** 17 organized specifications  
**Themes Explored:** 4 (UX Design, Interaction, Backend Logic, Publisher Controls)  
**Techniques Used:** SCAMPER (Substitute), Role Playing (2 personas)  
**Output:** Production-ready feature specification + 4-week implementation plan

---

*Facilitated by Mary (Business Analyst Agent) - Divee.AI BMAD Framework*
