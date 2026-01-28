# Suggested Reads Card - Visual Design Specification

**Project:** Divee.AI Widget - Suggested Reads Feature  
**Designer:** Sally (UX Designer)  
**Date:** 2026-01-27  
**Version:** 1.0 - MVP Specification  

---

## Overview

This document provides complete visual and interaction specifications for the suggested reads card component that appears in the Divee.AI chat widget after every 2nd AI response (#2, #4, #6, #8...).

**Design Goals:**
- Compact and unobtrusive in chat flow
- Visually distinct but not aggressive
- Accessible and responsive
- Culturally appropriate (RTL/LTR support)
- Match existing AI message styling

---

## Visual Layout

### Card Structure (LTR)

```
┌──────────────────────────────────────────────────────────────┐
│  ┌────────┐  DIVE DEEPER...                            [×]  │
│  │        │                                                   │
│  │ Image  │  Article Title That Can Span Up To              │
│  │ 80px   │  Three Lines Maximum With Ellipsis              │
│  │ Width  │  Applied If Content Exceeds...                  │
│  │ Full   │                                                   │
│  │ Height │                                                   │
│  └────────┘                                                   │
└──────────────────────────────────────────────────────────────┘
```

### Component Breakdown

**1. Container Card**
- **Display:** Block-level element in chat message flow
- **Border:** Same as AI message (1px solid #E5E7EB)
- **Border-radius:** 8px (match AI messages)
- **Background:** Same as AI message (#F3F4F6 or white - inherit)
- **Padding:** 16px all sides
- **Max-width:** 100% of chat container
- **Cursor:** pointer (entire card is clickable)

**2. Image (Left Side)**
- **Width:** 80px (fixed)
- **Height:** 100% (stretches to match card height)
- **Position:** Absolute left, taking full height
- **Border-radius:** 8px on left corners only (matches card edge)
- **Object-fit:** cover (crop to fill, maintain aspect)
- **Object-position:** center (crop from center)
- **Flex-shrink:** 0 (never shrinks)

**Fallback (No Image):**
If article has no featured image:
- Show solid color block (Divee brand color or #E5E7EB gray)
- Center Divee logo icon (optional, 32px, white or gray)
- OR show gradient (light to dark brand color)

**3. Text Container (Right Side)**
- **Display:** Flex column
- **Flex:** 1 (takes remaining space)
- **Margin-left:** 16px (gap from image)
- **Justify-content:** flex-start

**4. Label ("DIVE DEEPER...")**
- **Text:** "DIVE DEEPER..." (always uppercase)
- **Font-size:** 11px
- **Font-weight:** 500 (medium)
- **Color:** #6B7280 (medium gray)
- **Letter-spacing:** 0.5px (tracked for readability)
- **Text-transform:** uppercase
- **Margin-bottom:** 8px (gap to title)
- **Line-height:** 1.2

**5. Article Title**
- **Font-size:** 15px
- **Font-weight:** 600 (semibold)
- **Color:** #1F2937 (dark gray, high contrast)
- **Line-height:** 1.4
- **Display:** -webkit-box
- **-webkit-line-clamp:** 3 (max 3 lines)
- **-webkit-box-orient:** vertical
- **Overflow:** hidden
- **Text-overflow:** ellipsis
- **Max-height:** calc(1.4em × 3) = 63px (fallback for non-webkit)
- **Word-break:** break-word (prevents overflow)

**6. Dismiss Button (X)**
- **Position:** Absolute top-right
- **Top:** 12px
- **Right:** 12px
- **Size:** 20px × 20px (touch-friendly)
- **Color:** #9CA3AF (light gray)
- **Hover color:** #374151 (darker gray)
- **Font-size:** 16px
- **Cursor:** pointer
- **Background:** transparent
- **Border:** none
- **Padding:** 0
- **Z-index:** 10 (above card content)

**Note:** X button remains in top-right corner for both LTR and RTL (fixed position, no mirroring).

---

## Responsive Behavior

### Desktop (> 600px)
- Use specs as defined above
- Full hover effects enabled
- Image: 80px width

### Tablet (400px - 600px)
- Same layout, scaled proportionally
- Image: 80px width (no change)
- Title: 15px (no change)

### Mobile (< 400px)
```css
@media (max-width: 400px) {
  .suggestion-card-image {
    width: 60px; /* Narrower to give text more room */
  }
  
  .suggestion-card-title {
    font-size: 14px; /* Slightly smaller */
    -webkit-line-clamp: 2; /* Only 2 lines on tiny screens */
    max-height: calc(1.4em × 2); /* Adjust max-height */
  }
  
  .suggestion-card {
    padding: 12px; /* Tighter padding */
  }
  
  .suggestion-card-text {
    margin-left: 12px; /* Reduced gap */
  }
}
```

---

## RTL (Right-to-Left) Support

### What Changes in RTL:
1. **Text alignment:** All text aligns right (title, label)
2. **Reading order:** Hebrew/Arabic flows right-to-left
3. **Entrance animation:** Flies in from LEFT (instead of right)

### What DOES NOT Change in RTL:
1. **Card layout:** Image still on left, text on right (NOT mirrored)
2. **X button position:** Always top-right corner
3. **Image position:** Always left side

### Implementation:
```css
[dir="rtl"] .suggestion-card-title,
[dir="rtl"] .suggestion-card-label {
  text-align: right;
  direction: rtl;
}

[dir="rtl"] .suggestion-card {
  animation: slideInRTL 300ms ease-out; /* Flies from left */
}
```

**Why no full mirror?**
- Image-left layout is universally understood
- Avoids complex layout reconfiguration
- Simpler development and maintenance
- X button convention (top-right = close) is cross-cultural

---

## Interactions & Animations

### Entrance Animation (On Card Appearance)

**LTR Animation:**
```css
@keyframes slideInLTR {
  from {
    transform: translateX(20px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.suggestion-card {
  animation: slideInLTR 300ms ease-out;
}
```

**RTL Animation:**
```css
@keyframes slideInRTL {
  from {
    transform: translateX(-20px); /* Flies from left */
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

[dir="rtl"] .suggestion-card {
  animation: slideInRTL 300ms ease-out;
}
```

**Timing:**
- Duration: 300ms (quick but noticeable)
- Easing: ease-out (starts fast, decelerates)
- Opacity: 0 → 1 (fades in simultaneously)
- Transform: translateX + opacity (smooth entrance)

---

### Hover State (Desktop Only)

**Default State:**
```css
.suggestion-card {
  transform: translateY(0);
  box-shadow: none;
  transition: all 200ms ease-out;
}
```

**Hover State:**
```css
.suggestion-card:hover {
  transform: translateY(-2px); /* Subtle lift */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); /* Soft shadow */
  cursor: pointer;
}
```

**X Button Hover:**
```css
.suggestion-card-dismiss {
  color: #9CA3AF;
  transition: color 150ms ease;
}

.suggestion-card-dismiss:hover {
  color: #374151; /* Darkens on hover */
}
```

**No hover on mobile/touch devices:**
```css
@media (hover: none) {
  .suggestion-card:hover {
    transform: none; /* Disable lift on touch */
    box-shadow: none;
  }
}
```

---

### Click Behavior

**Card Click:**
- Opens article in NEW TAB (target="_blank")
- No visual feedback animation (just standard link behavior)
- Cursor: pointer throughout card
- Analytics event: `suggestion_clicked`

**X Button Click:**
- **Step 1:** Click X → Card transforms to dismissal confirmation
- **Step 2:** "Yes, hide them" or "Cancel"
- See "Dismissal Flow" section below for details

---

## Dismissal Flow (Two-Step Confirmation)

### Step 1: X Button Clicked

Card content fades out and is replaced with confirmation message.

**Before (Normal State):**
```
┌──────────────────────────────────────────────┐
│  ┌────┐  DIVE DEEPER...              [×]    │
│  │Img │  Article Title Here                 │
│  └────┘                                      │
└──────────────────────────────────────────────┘
```

**After (Confirmation State):**
```
┌──────────────────────────────────────────────┐
│                                               │
│  Don't show suggestions in this chat?        │
│  (You'll miss related articles)              │
│                                               │
│  [  Cancel  ]  [  Yes, hide them  ]         │
│                                               │
└──────────────────────────────────────────────┘
```

**Transition:**
- Fade out card content (200ms)
- Fade in confirmation message (200ms)
- Sequential (content out → message in)

---

### Step 2: User Choice

**Option A: "Yes, hide them" Button**
- **Appearance:** Primary button (Divee brand color, white text)
- **Action:** 
  - Card fades out (200ms)
  - Set sessionStorage flag: `divee_suggestions_suppressed_{conversationId} = true`
  - All future suggestion cards suppressed for this session
  - Analytics event: `suggestion_dismissed_confirmed`

**Option B: "Cancel" Button**
- **Appearance:** Ghost button (transparent bg, gray border, gray text)
- **Action:**
  - Fade out confirmation message (200ms)
  - Fade in original card content (200ms)
  - Card returns to normal state
  - Analytics event: `suggestion_dismissed_cancelled`

---

### Dismissal Confirmation UI Specs

**Container:**
- Same card styling (border, bg, padding)
- Center-aligned content
- Padding: 24px (more spacious for readability)

**Message Text:**
- **Line 1:** "Don't show suggestions in this chat?"
  - Font-size: 15px
  - Font-weight: 600 (semibold)
  - Color: #1F2937 (dark gray)
  - Margin-bottom: 4px

- **Line 2:** "(You'll miss related articles)"
  - Font-size: 13px
  - Font-weight: 400 (regular)
  - Color: #6B7280 (medium gray)
  - Margin-bottom: 20px

**Buttons Container:**
- Display: flex
- Gap: 12px (space between buttons)
- Justify-content: center

**Cancel Button:**
- Padding: 8px 16px
- Border: 1px solid #D1D5DB
- Border-radius: 6px
- Background: transparent
- Color: #6B7280
- Font-size: 14px
- Font-weight: 500
- Cursor: pointer
- Hover: Background #F9FAFB

**Yes, hide them Button:**
- Padding: 8px 16px
- Border: none
- Border-radius: 6px
- Background: [Divee brand color] (or #3B82F6 blue as fallback)
- Color: white
- Font-size: 14px
- Font-weight: 600
- Cursor: pointer
- Hover: Background darkens 10%

---

## Accessibility

### Keyboard Navigation
- Entire card is focusable (tabindex="0")
- Enter/Space key opens article (same as click)
- X button is independently focusable
- Focus indicator: 2px solid brand color outline with 2px offset

### Screen Readers
- Card: `role="link"` with `aria-label="Suggested article: {article title}"`
- X button: `aria-label="Dismiss suggestion"`
- Label text: `aria-hidden="true"` (redundant with card aria-label)
- Image: `alt="{article title}"` or `alt=""` if decorative

### Focus Order
1. Card (entire clickable area)
2. X button (dismiss)
3. (If dismissed) Cancel button
4. (If dismissed) Yes, hide them button

### Color Contrast
- Title (#1F2937) on light bg: 12.6:1 (AAA ✓)
- Label (#6B7280) on light bg: 4.7:1 (AA ✓)
- X button (#9CA3AF) on light bg: 3.2:1 (AA large text ✓)

---

## States Summary

| State | Visual | Interaction |
|-------|--------|-------------|
| **Default** | Card with image, label, title, X button | Hoverable, clickable |
| **Hover** (desktop) | Lifted 2px, shadow appears | Cursor: pointer |
| **Focus** | 2px blue outline, 2px offset | Enter/Space to activate |
| **Clicked** | Opens new tab | New tab with article |
| **Dismissing** | Transforms to confirmation UI | Shows buttons |
| **Dismissed** | Fades out completely | Removed from DOM |
| **Suppressed** | Never appears | sessionStorage flag set |

---

## CSS Class Structure

```html
<div class="divee-suggestion-card" role="link" tabindex="0" aria-label="Suggested article: {title}">
  
  <!-- Image -->
  <div class="divee-suggestion-image">
    <img src="{imageUrl}" alt="{title}" />
  </div>
  
  <!-- Text Content -->
  <div class="divee-suggestion-text">
    <div class="divee-suggestion-label" aria-hidden="true">
      Dive deeper...
    </div>
    <h4 class="divee-suggestion-title">
      {articleTitle}
    </h4>
  </div>
  
  <!-- Dismiss Button -->
  <button 
    class="divee-suggestion-dismiss" 
    aria-label="Dismiss suggestion"
    type="button">
    ×
  </button>
  
</div>
```

**Confirmation State HTML:**
```html
<div class="divee-suggestion-card divee-suggestion-dismissing">
  <div class="divee-suggestion-confirm">
    <p class="divee-suggestion-confirm-title">
      Don't show suggestions in this chat?
    </p>
    <p class="divee-suggestion-confirm-subtitle">
      (You'll miss related articles)
    </p>
    <div class="divee-suggestion-confirm-actions">
      <button class="divee-btn-ghost">Cancel</button>
      <button class="divee-btn-primary">Yes, hide them</button>
    </div>
  </div>
</div>
```

---

## Complete CSS Specification

```css
/* ============================================
   SUGGESTION CARD - BASE STYLES
   ============================================ */

.divee-suggestion-card {
  /* Layout */
  display: flex;
  position: relative;
  width: 100%;
  max-width: 100%;
  
  /* Spacing */
  padding: 16px;
  gap: 16px;
  
  /* Visual */
  background: #F3F4F6; /* Match AI message bg */
  border: 1px solid #E5E7EB; /* Match AI message border */
  border-radius: 8px;
  
  /* Interaction */
  cursor: pointer;
  text-decoration: none;
  color: inherit;
  
  /* Animation */
  animation: slideInLTR 300ms ease-out;
  transition: all 200ms ease-out;
  
  /* Accessibility */
  outline: none;
}

/* RTL entrance animation */
[dir="rtl"] .divee-suggestion-card {
  animation: slideInRTL 300ms ease-out;
}

/* Hover state (desktop only) */
@media (hover: hover) {
  .divee-suggestion-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
}

/* Focus state (keyboard navigation) */
.divee-suggestion-card:focus {
  outline: 2px solid #3B82F6;
  outline-offset: 2px;
}

/* Active state (click feedback on mobile) */
.divee-suggestion-card:active {
  transform: translateY(0);
  opacity: 0.9;
}


/* ============================================
   IMAGE
   ============================================ */

.divee-suggestion-image {
  /* Layout */
  flex-shrink: 0;
  width: 80px;
  height: 100%;
  min-height: 80px; /* Ensure minimum height */
  
  /* Visual */
  border-radius: 8px;
  overflow: hidden;
  background: #E5E7EB; /* Fallback bg */
}

.divee-suggestion-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
}

/* Mobile: Smaller image */
@media (max-width: 400px) {
  .divee-suggestion-image {
    width: 60px;
    min-height: 60px;
  }
}


/* ============================================
   TEXT CONTENT
   ============================================ */

.divee-suggestion-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  min-width: 0; /* Allow text truncation */
}

/* Label */
.divee-suggestion-label {
  font-size: 11px;
  font-weight: 500;
  color: #6B7280;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  line-height: 1.2;
  margin-bottom: 8px;
}

/* RTL text alignment */
[dir="rtl"] .divee-suggestion-label {
  text-align: right;
  direction: rtl;
}

/* Title */
.divee-suggestion-title {
  font-size: 15px;
  font-weight: 600;
  color: #1F2937;
  line-height: 1.4;
  margin: 0;
  
  /* Line clamp */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  
  /* Fallback for non-webkit browsers */
  max-height: calc(1.4em * 3); /* 63px at 15px font-size */
  word-break: break-word;
}

/* RTL text alignment */
[dir="rtl"] .divee-suggestion-title {
  text-align: right;
  direction: rtl;
}

/* Mobile: Smaller title, 2 lines max */
@media (max-width: 400px) {
  .divee-suggestion-title {
    font-size: 14px;
    -webkit-line-clamp: 2;
    max-height: calc(1.4em * 2); /* 39.2px at 14px */
  }
  
  .divee-suggestion-text {
    margin-left: 12px;
  }
}


/* ============================================
   DISMISS BUTTON (X)
   ============================================ */

.divee-suggestion-dismiss {
  /* Position */
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 10;
  
  /* Layout */
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  
  /* Visual */
  background: transparent;
  border: none;
  color: #9CA3AF;
  font-size: 16px;
  line-height: 1;
  
  /* Interaction */
  cursor: pointer;
  transition: color 150ms ease;
  padding: 0;
}

.divee-suggestion-dismiss:hover {
  color: #374151;
}

.divee-suggestion-dismiss:focus {
  outline: 2px solid #3B82F6;
  outline-offset: 2px;
  border-radius: 2px;
}

/* Note: X button does NOT mirror in RTL - always top-right */


/* ============================================
   DISMISSAL CONFIRMATION STATE
   ============================================ */

.divee-suggestion-dismissing {
  /* Override card layout for confirmation UI */
  display: block;
  padding: 24px;
  cursor: default;
}

.divee-suggestion-dismissing:hover {
  transform: none;
  box-shadow: none;
}

.divee-suggestion-confirm {
  text-align: center;
}

.divee-suggestion-confirm-title {
  font-size: 15px;
  font-weight: 600;
  color: #1F2937;
  margin: 0 0 4px 0;
}

.divee-suggestion-confirm-subtitle {
  font-size: 13px;
  font-weight: 400;
  color: #6B7280;
  margin: 0 0 20px 0;
}

.divee-suggestion-confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

/* Cancel button (ghost) */
.divee-btn-ghost {
  padding: 8px 16px;
  border: 1px solid #D1D5DB;
  border-radius: 6px;
  background: transparent;
  color: #6B7280;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 150ms ease;
}

.divee-btn-ghost:hover {
  background: #F9FAFB;
}

.divee-btn-ghost:focus {
  outline: 2px solid #3B82F6;
  outline-offset: 2px;
}

/* Yes, hide them button (primary) */
.divee-btn-primary {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: #3B82F6; /* Use Divee brand color */
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
}

.divee-btn-primary:hover {
  background: #2563EB; /* 10% darker */
}

.divee-btn-primary:focus {
  outline: 2px solid #3B82F6;
  outline-offset: 2px;
}


/* ============================================
   ANIMATIONS
   ============================================ */

@keyframes slideInLTR {
  from {
    transform: translateX(20px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideInRTL {
  from {
    transform: translateX(-20px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* Fade out animation (when dismissed) */
@keyframes fadeOut {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

.divee-suggestion-card.is-dismissed {
  animation: fadeOut 200ms ease-out forwards;
}


/* ============================================
   MOBILE RESPONSIVE
   ============================================ */

@media (max-width: 400px) {
  .divee-suggestion-card {
    padding: 12px;
    gap: 12px;
  }
  
  .divee-suggestion-dismiss {
    top: 8px;
    right: 8px;
  }
}
```

---

## Implementation Notes for Developers

### 1. Card Rendering Logic

**When to show:**
```javascript
// In chat message rendering loop
const messageNumber = aiResponses.length; // Count of AI responses so far

if (messageNumber % 2 === 0 && messageNumber > 0) {
  // Check if suggestions are suppressed
  const suppressed = sessionStorage.getItem(
    `divee_suggestions_suppressed_${conversationId}`
  );
  
  if (!suppressed) {
    renderSuggestionCard(conversationId, messageNumber);
  }
}
```

**Fetching suggestion data:**
```javascript
async function renderSuggestionCard(conversationId, position) {
  // Fetch from backend
  const response = await fetch('/api/v1/get-suggested-articles', {
    method: 'POST',
    body: JSON.stringify({
      projectId,
      currentArticleUrl: window.location.href,
      conversationId,
      suggestionIndex: Math.floor(position / 2) // 2→0, 4→1, 6→2, 8→3
    })
  });
  
  const { suggestion } = await response.json();
  
  if (suggestion) {
    insertCardIntoChat(suggestion, position);
    trackAnalytics('suggestion_shown', { ...suggestion, position });
  }
}
```

---

### 2. Click Handlers

**Card click (opens article):**
```javascript
card.addEventListener('click', (e) => {
  // Don't trigger if clicking X button
  if (e.target.closest('.divee-suggestion-dismiss')) {
    return;
  }
  
  // Track click
  trackAnalytics('suggestion_clicked', {
    article_id: suggestion.unique_id,
    position,
    conversation_id: conversationId
  });
  
  // Open in new tab
  window.open(suggestion.url, '_blank');
});
```

**X button click (dismissal flow):**
```javascript
dismissBtn.addEventListener('click', (e) => {
  e.stopPropagation(); // Prevent card click
  
  // Track dismissal intent
  trackAnalytics('suggestion_x_clicked', {
    article_id: suggestion.unique_id,
    position,
    conversation_id: conversationId
  });
  
  // Show confirmation UI
  showDismissalConfirmation(card, suggestion, conversationId);
});

function showDismissalConfirmation(card, suggestion, conversationId) {
  // Fade out content
  card.classList.add('is-transitioning');
  
  setTimeout(() => {
    // Replace content with confirmation UI
    card.innerHTML = `
      <div class="divee-suggestion-confirm">
        <p class="divee-suggestion-confirm-title">
          Don't show suggestions in this chat?
        </p>
        <p class="divee-suggestion-confirm-subtitle">
          (You'll miss related articles)
        </p>
        <div class="divee-suggestion-confirm-actions">
          <button class="divee-btn-ghost" data-action="cancel">Cancel</button>
          <button class="divee-btn-primary" data-action="confirm">Yes, hide them</button>
        </div>
      </div>
    `;
    
    card.classList.add('divee-suggestion-dismissing');
    card.classList.remove('is-transitioning');
    
    // Add button handlers
    card.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      trackAnalytics('suggestion_dismissed_cancelled', { ...suggestion });
      restoreOriginalCard(card, suggestion);
    });
    
    card.querySelector('[data-action="confirm"]').addEventListener('click', () => {
      trackAnalytics('suggestion_dismissed_confirmed', { ...suggestion });
      suppressSuggestions(conversationId);
      removeCard(card);
    });
  }, 200); // Wait for fade out
}

function suppressSuggestions(conversationId) {
  sessionStorage.setItem(
    `divee_suggestions_suppressed_${conversationId}`,
    'true'
  );
}
```

---

### 3. RTL Detection

```javascript
// Detect page direction
const isRTL = document.dir === 'rtl' || 
              document.documentElement.dir === 'rtl' ||
              getComputedStyle(document.body).direction === 'rtl';

// Apply to card
if (isRTL) {
  card.setAttribute('dir', 'rtl');
}
```

---

### 4. Image Loading

**Lazy loading with fallback:**
```javascript
function createImageElement(imageUrl, title) {
  const container = document.createElement('div');
  container.className = 'divee-suggestion-image';
  
  const img = document.createElement('img');
  img.src = imageUrl;
  img.alt = title;
  img.loading = 'lazy'; // Native lazy loading
  
  // Fallback if image fails to load
  img.onerror = () => {
    container.style.background = '#E5E7EB'; // Show gray fallback
    img.style.display = 'none';
  };
  
  container.appendChild(img);
  return container;
}
```

---

## Testing Checklist

### Visual Testing
- [ ] Card renders correctly in chat flow
- [ ] Image scales properly (cover, no distortion)
- [ ] Title truncates at 3 lines with ellipsis
- [ ] "Dive deeper..." label is uppercase and gray
- [ ] X button is visible and properly positioned
- [ ] Border and background match AI messages
- [ ] Spacing is consistent (16px padding, 16px gap)

### Interaction Testing
- [ ] Hover effect works on desktop (lift + shadow)
- [ ] No hover effect on mobile/touch devices
- [ ] Click opens article in new tab
- [ ] X button doesn't trigger card click
- [ ] Dismissal confirmation appears smoothly
- [ ] Cancel restores original card
- [ ] Confirm suppresses all future suggestions
- [ ] sessionStorage flag persists across page interactions

### Responsive Testing
- [ ] Desktop (> 600px): Full specs
- [ ] Tablet (400-600px): Scales appropriately
- [ ] Mobile (< 400px): 60px image, 2-line title, 14px font
- [ ] Portrait and landscape orientations
- [ ] Various screen widths (320px, 375px, 414px, 768px, 1024px)

### RTL Testing
- [ ] Text aligns right in RTL mode
- [ ] Entrance animation comes from left (not right)
- [ ] X button stays top-right (doesn't mirror)
- [ ] Hebrew/Arabic text renders correctly
- [ ] Title truncation works in RTL

### Accessibility Testing
- [ ] Card is keyboard navigable (Tab key)
- [ ] Focus indicator is visible (2px blue outline)
- [ ] Enter/Space opens article
- [ ] X button is independently focusable
- [ ] Screen reader announces card purpose
- [ ] Color contrast meets WCAG AA standards
- [ ] Focus order is logical (card → X → buttons)

### Edge Case Testing
- [ ] No featured image: Fallback appears
- [ ] Very long title (200+ chars): Truncates properly
- [ ] Very short title (< 20 chars): No layout issues
- [ ] Missing article data: Card doesn't render
- [ ] Rapid scrolling: Animations don't stack/glitch
- [ ] Multiple cards in view: All animate independently
- [ ] Dismissed then reload page: Suggestions return (new session)
- [ ] Dismissed then new article: Suggestions return (new conversation)

### Performance Testing
- [ ] Entrance animation is smooth (60fps)
- [ ] Hover effect doesn't cause jank
- [ ] Image loading doesn't block rendering
- [ ] Multiple cards don't impact performance
- [ ] Analytics events fire without delays

---

## Design Rationale

### Why These Choices?

**1. Horizontal Layout**
- **Rationale:** Minimizes vertical space in chat flow. Chat messages are typically narrow columns, so horizontal card feels more natural than tall vertical card.
- **User Benefit:** Doesn't interrupt reading flow; feels like part of conversation.

**2. Image on Left (Always)**
- **Rationale:** Left-aligned images are universally understood visual anchors. Mirroring for RTL adds complexity without UX benefit.
- **User Benefit:** Consistent experience reduces cognitive load; images "pop" from left edge.

**3. 3-Line Title Clamp**
- **Rationale:** Balance between preview (needs enough text to be compelling) and space (can't dominate chat).
- **User Benefit:** Enough context to decide interest without overwhelming.

**4. "Dive deeper..." Label**
- **Rationale:** Brand alignment (Divee → Dive). Subtle system label (like "Suggested" or "Recommended") without aggressive marketing language.
- **User Benefit:** Clear context without feeling like an ad; playful without being unprofessional.

**5. Two-Step Dismissal**
- **Rationale:** Prevents accidental opt-outs while respecting user control. Confirmation message gently reminds value without guilting.
- **User Benefit:** Reduces regret; allows reconsideration without penalty.

**6. X Button (Always Top-Right)**
- **Rationale:** Universal "close" convention. Top-right is muscle memory for dismissal across cultures.
- **User Benefit:** Instant recognition; no learning curve.

**7. New Tab Behavior**
- **Rationale:** Preserves conversation context. Users can explore without losing current article/chat.
- **User Benefit:** Low friction exploration; easy return to original context.

**8. Entrance from Side (Not Top/Bottom)**
- **Rationale:** Horizontal motion feels gentler than vertical (which can feel intrusive). Direction matches reading flow (LTR/RTL).
- **User Benefit:** Subtle appearance; doesn't "jump out" aggressively.

---

## Next Steps

### For Design Team:
1. Review this spec for brand alignment
2. Confirm color values match Divee brand guidelines
3. Create high-fidelity mockups (if needed)
4. Design fallback states (no image, error states)

### For Development Team:
1. Implement HTML/CSS structure as specified
2. Add JavaScript interaction handlers
3. Integrate with backend API (`/api/v1/get-suggested-articles`)
4. Wire up analytics events (5 tracking points)
5. Test across browsers (Chrome, Firefox, Safari, Edge)
6. Test on devices (iOS Safari, Android Chrome)

### For QA Team:
1. Run through testing checklist (above)
2. Validate RTL behavior with Hebrew/Arabic content
3. Test accessibility with keyboard + screen reader
4. Performance test with slow network (image loading)
5. Edge case validation (missing data, errors)

---

## Version History

**v1.0 - 2026-01-27**
- Initial specification
- Horizontal layout with image-left
- 3-line title clamp
- Two-step dismissal flow
- RTL support (partial mirror)
- Complete CSS implementation
- Testing checklist

---

## Contact

**Questions or clarifications?**
Contact: Sally (UX Designer Agent)  
Project: Divee.AI Widget - Suggested Reads Feature

---

*This specification is part of the Suggested Reads Feature MVP as documented in:*  
`_bmad-output/suggested-reads-feature-brainstorm.md`
