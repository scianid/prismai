# Testing Checklist After Optimization

**Date:** January 24, 2026  
**Changes:** Removed unused CSS/HTML, stripped console.log from production build

---

## Quick Verification Tests

### 1. Widget Initialization ✅
```html
<!-- Test page -->
<script src="dist/divee.sdk.latest.js" data-project-id="test-project"></script>
```

**Expected:**
- Widget appears on page
- No console errors
- Loads within 2 seconds

---

### 2. Collapsed View ✅
**Check:**
- [ ] Search input with typewriter animation visible
- [ ] AI icon and site icon displayed
- [ ] "Powered by divee.ai" link present
- [ ] Gradient border on hover
- [ ] Ad slot visible (if enabled in anchored mode)
- [ ] No missing styles

---

### 3. Expanded View ✅
**Check:**
- [ ] Click collapsed view → expands smoothly
- [ ] Header with title and close button
- [ ] Chat area visible
- [ ] Input textarea with character counter
- [ ] Send button visible
- [ ] Empty state icon shown (first time)
- [ ] No missing HTML elements

---

### 4. Suggestions ✅
**Check:**
- [ ] Focus on input → suggestions dropdown appears
- [ ] Shimmer loading animation shows
- [ ] 3-5 suggestions load
- [ ] Click suggestion → adds to chat
- [ ] Click outside → dropdown closes
- [ ] Reopen → cached suggestions appear instantly

---

### 5. Chat Functionality ✅
**Check:**
- [ ] Type question → send button works
- [ ] AI response streams correctly
- [ ] Cursor animation during streaming
- [ ] Multiple messages display properly
- [ ] User messages right-aligned
- [ ] AI messages left-aligned with icon
- [ ] Chat scrolls automatically

---

### 6. Ad System ✅
**Check:**
- [ ] Ads initialize (check network tab for GPT script)
- [ ] Desktop ad shows on desktop viewport
- [ ] Mobile ad shows on mobile viewport
- [ ] Empty ads collapse properly
- [ ] Ads track impressions (check analytics)
- [ ] Ad clicks track (check analytics)

---

### 7. Analytics ✅
**Check:**
- [ ] `widget_loaded` event fires
- [ ] `widget_expanded` event fires
- [ ] `question_asked` event fires
- [ ] Visitor ID persists (check localStorage)
- [ ] Session ID persists (check sessionStorage)
- [ ] Events contain proper data

---

### 8. Responsive Design ✅
**Test Viewports:**
- [ ] Mobile (375px) - widget adapts, mobile ads show
- [ ] Tablet (768px) - proper layout
- [ ] Desktop (1920px) - desktop ads show, proper sizing

---

### 9. Floating Mode ✅
**If display_mode: 'floating':**
- [ ] Widget appears in corner (bottom-right/bottom-left)
- [ ] Collapsed state is compact button
- [ ] Expanded state is floating chat window
- [ ] No ads in collapsed floating state
- [ ] Mobile: collapses to circle icon

---

### 10. RTL Support ✅
**If direction: 'rtl':**
- [ ] Widget has `dir="rtl"` attribute
- [ ] Text flows right-to-left
- [ ] Icons mirrored correctly
- [ ] Messages align correctly

---

## Regression Tests

### Removed Items (Verify No Impact)

**CSS Classes Removed:**
- `.divee-header-inline` - Never used ✅
- `.divee-typewriter` - Never used ✅
- `.divee-cursor-inline` - Never used ✅
- `.divee-article-card` - Never used ✅
- `.divee-ad-placeholder` - Never rendered ✅
- `@keyframes divee-slide-in-right` - Never applied ✅

**HTML Removed:**
- Top-level `.divee-suggestions` div (not the input dropdown) ✅

**Debug Code Removed:**
- All `console.log()` statements (production only) ✅
- All `this.log()` calls (production only) ✅

**Expected:** No visual or functional changes!

---

## Browser Compatibility

Test in:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Safari iOS (latest)
- [ ] Chrome Android (latest)

---

## Debug Mode Test

Enable debug mode to verify logging still works in development:

```html
<!-- Add ?diveeDebug=true to URL -->
https://example.com/article?diveeDebug=true
```

**Expected:** Console logs still appear in debug mode ✅

---

## Performance Verification

### Bundle Size
```bash
# Check file size
ls -lh dist/divee.sdk.latest.js

# Expected: ~46 KB
```

### Network Transfer
Check in DevTools Network tab:
- **Uncompressed:** 46.16 KB
- **Gzipped:** 11.48 KB ✅

### Load Time
- Widget download + parse < 150ms on 4G ✅

---

## Known Good State

If issues found, revert to previous build:
```bash
cp dist/divee.sdk.24-01-26-132212.js dist/divee.sdk.latest.js
```

Previous size: 48.61 KB (pre-optimization)

---

## Issue Reporting

If you find issues, note:
1. Which test failed
2. Browser and version
3. Console errors (if any)
4. Expected vs actual behavior
5. Screenshots/video if applicable

---

## Sign-Off

**Tested by:** _________________  
**Date:** _________________  
**Status:** [ ] Pass [ ] Fail  
**Notes:**

---

## Automated Tests (Future)

Consider adding:
1. **Jest unit tests** for widget methods
2. **Playwright E2E tests** for user flows
3. **Bundle size check** in CI/CD
4. **Visual regression tests** with Percy/Chromatic
