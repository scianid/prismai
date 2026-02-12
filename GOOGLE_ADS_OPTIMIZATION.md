# Google Ads Display Optimization Recommendations

## Current Issues Identified

1. **Fixed 1-second delay** before displaying ads - may cause missed impressions or unnecessary blanks
2. **No refresh strategy** for expanded view ads
4. **Missing targeting parameters** - no contextual data passed to ad requests
5. **No viewability optimization** - ads may render off-screen

---

## Recommendations

### 1. Replace Fixed Timeout with GPT Ready Check

Instead of using a hardcoded `setTimeout(1000)`, wait for GPT to be properly initialized:

```javascript
// Instead of setTimeout(1000), wait for GPT to be ready
googletag.cmd.push(() => {
    googletag.pubads().addEventListener('slotRenderEnded', (event) => {
        // Handle render completion
    });
});
```

**Impact:** Reduces blank ads caused by race conditions

---

### 2. Add Lazy Loading for Better Fill Rates

Only request ads when widget is in viewport or about to be displayed:

```javascript
googletag.pubads().enableLazyLoad({
    fetchMarginPercent: 200,  // Fetch 2 viewports ahead
    renderMarginPercent: 100, // Render 1 viewport ahead
    mobileScaling: 2.0        // Double margins on mobile
});
```

**Impact:** Improves viewability scores significantly, reduces wasted impressions

---

### 3. Add Page-Level Targeting

Pass contextual data to improve ad relevance and fill rates:

```javascript
googletag.pubads().setTargeting('article_category', category);
googletag.pubads().setTargeting('content_type', 'article');
googletag.pubads().setTargeting('widget_position', position);
```

**Impact:** Higher CPMs, better fill rates through improved ad matching

---

### 4. Implement Single Request Architecture (SRA)

Reduces latency and improves fill by batching ad requests:

```javascript
googletag.pubads().enableSingleRequest();
```

**Impact:** Faster ad loading, competitive exclusion support, better fill

---

### 5. Handle Empty Slots Gracefully

Listen for render events to track fill rate and handle unfilled slots:

```javascript
googletag.pubads().addEventListener('slotRenderEnded', (event) => {
    if (event.isEmpty) {
        // Track unfilled impression, maybe show fallback
        this.trackEvent('ad_unfilled', { slotId: event.slot.getSlotElementId() });
    }
});
```

**Impact:** Better visibility into fill rate issues, enables fallback strategies

---

### 6. Refresh Ads on Expand (with Throttle)

Refresh ads when user expands widget, but throttle to respect Google policies:

```javascript
// Refresh expanded ads, but not more than once per 30s
googletag.pubads().refresh([expandedSlot]);
```

**Impact:** Additional impressions from engaged users

---

### 7. Add Size Mapping for Responsive Ads

Define responsive ad sizes to maximize fill across different screen sizes:

```javascript
const sizeMapping = googletag.sizeMapping()
    .addSize([1024, 768], [[728, 90], [650, 100]])
    .addSize([640, 480], [[300, 250]])
    .addSize([0, 0], [[300, 250], [336, 280]])
    .build();
desktopSlot.defineSizeMapping(sizeMapping);
```

**Impact:** Fewer blanks on different screen sizes, better mobile fill

---

## Implementation Priority

| Priority | Recommendation | Effort | Impact | Status |
|----------|---------------|--------|--------|--------|
| 1 | Lazy Loading | Medium | High | ✅ Done |
| 2 | SRA + slotRenderEnded listener | Low | High | ✅ Done |
| 3 | Size Mapping | Medium | Medium | ✅ Done |
| 4 | GPT Ready Check | Low | Medium | ✅ Done |
| 5 | Page-Level Targeting | Medium | Medium | ✅ Done |
| 6 | Ad Refresh on Expand | Low | Low | ✅ Done |
| 7 | Empty Slot Handling | Low | Low | ✅ Done |

---

## Additional Considerations

### Ad Density Guidelines
- Ensure ad-to-content ratio stays reasonable
- Google recommends no more than 1 ad per screen on mobile

### Viewability Best Practices
- Ads should be at least 50% visible for 1 second (display) or 2 seconds (video)
- Position ads in high-viewability areas (above the fold, near content)

### Testing
- Use Google Publisher Console (`googletag.openConsole()`) for debugging
- Monitor fill rates and viewability in Google Ad Manager reporting

---

## Current Implementation Location

File: `src/widget.js`

Key methods:
- `initGoogleAds()` - Ad initialization (lines 125-220)
- `displayAdsIfNeeded()` - Ad display logic (lines 787-902)
- `displayExpandedAds()` - Expanded view ads (lines 907-932)
