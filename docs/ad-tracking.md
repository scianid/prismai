# Ad Click Tracking Implementation

## Overview
This document describes the ad click tracking implementation that logs ad impressions and clicks to the analytics system.

## Features Implemented

### 1. **Ad Impression Tracking**
- Automatically tracks when ads are successfully rendered (not empty)
- Captures ad metadata: slot ID, position (collapsed/expanded), size, advertiser ID, creative ID, line item ID
- Event type: `ad_impression`

### 2. **Ad Click Tracking**
- Tracks user clicks on ad containers
- Captures click coordinates and timestamp in addition to ad metadata
- Event type: `ad_click`

### 3. **Analytics Backend Endpoint**
- New Edge Function: `/analytics`
- Receives events from widget and logs to `analytics_events` table
- Includes visitor and session tracking

## Implementation Details

### Client-Side (Widget)

**Location:** `src/widget.js`

#### New Methods:

1. **`setupAdClickTracking(adElement, slotId, eventData)`**
   - Attaches click event listeners to rendered ads
   - Logs `ad_click` events with full context
   - Handles cross-origin iframe restrictions

2. **`trackEvent(eventName, data)` (enhanced)**
   - Now sends events to backend endpoint
   - Uses `navigator.sendBeacon()` for reliability (with fetch fallback)
   - Includes visitor_id and session_id for correlation
   - Endpoint: `${apiBaseUrl}/analytics`

#### Integration Points:

The tracking is integrated into the Google Ads event listeners:

```javascript
googletag.pubads().addEventListener('slotRenderEnded', function (event) {
    if (!event.isEmpty) {
        // Track impression
        self.trackEvent('ad_impression', {
            ad_unit: slotId,
            position: 'collapsed' | 'expanded',
            size: '728x90',
            advertiser_id: event.advertiserId,
            creative_id: event.creativeId,
            line_item_id: event.lineItemId
        });
        
        // Setup click tracking
        self.setupAdClickTracking(adElement, slotId, event);
    }
});
```

### Server-Side (Edge Function)

**Location:** `supabase/functions/analytics/index.ts`

**Method:** `POST /analytics`

**Request Body:**
```json
{
    "project_id": "proj_123",
    "visitor_id": "uuid-visitor",
    "session_id": "uuid-session",
    "event_type": "ad_click",
    "event_label": null,
    "event_data": {
        "ad_unit": "div-gpt-ad-1768979426842-0",
        "position": "collapsed",
        "size": "728x90",
        "advertiser_id": "123456",
        "creative_id": "789012",
        "line_item_id": "345678",
        "click_x": 450,
        "click_y": 320,
        "timestamp": 1706012345678
    }
}
```

**Response:**
```json
{
    "success": true
}
```

## Database Schema

Events are stored in the `analytics_events` table:

| Column | Type | Description |
|--------|------|-------------|
| `id` | `bigint` | Auto-increment primary key |
| `project_id` | `text` | Widget/project identifier |
| `visitor_id` | `uuid` | Persistent visitor identifier |
| `session_id` | `uuid` | Session identifier |
| `event_type` | `text` | 'ad_impression' or 'ad_click' |
| `event_label` | `text` | Optional label (null for ads) |
| `event_data` | `jsonb` | Rich event data with ad metadata |
| `created_at` | `timestamptz` | Event timestamp |

## Queries for Analytics Dashboard

### Total Ad Impressions
```sql
SELECT COUNT(*) 
FROM analytics_events 
WHERE event_type = 'ad_impression'
  AND project_id = 'proj_123'
  AND created_at >= NOW() - INTERVAL '30 days';
```

### Total Ad Clicks
```sql
SELECT COUNT(*) 
FROM analytics_events 
WHERE event_type = 'ad_click'
  AND project_id = 'proj_123'
  AND created_at >= NOW() - INTERVAL '30 days';
```

### Click-Through Rate (CTR)
```sql
SELECT 
    COUNT(*) FILTER (WHERE event_type = 'ad_impression') as impressions,
    COUNT(*) FILTER (WHERE event_type = 'ad_click') as clicks,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE event_type = 'ad_click') / 
        NULLIF(COUNT(*) FILTER (WHERE event_type = 'ad_impression'), 0), 
        2
    ) as ctr_percentage
FROM analytics_events
WHERE event_type IN ('ad_impression', 'ad_click')
  AND project_id = 'proj_123'
  AND created_at >= NOW() - INTERVAL '30 days';
```

### Performance by Ad Position
```sql
SELECT 
    event_data->>'position' as position,
    COUNT(*) FILTER (WHERE event_type = 'ad_impression') as impressions,
    COUNT(*) FILTER (WHERE event_type = 'ad_click') as clicks,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE event_type = 'ad_click') / 
        NULLIF(COUNT(*) FILTER (WHERE event_type = 'ad_impression'), 0), 
        2
    ) as ctr
FROM analytics_events
WHERE event_type IN ('ad_impression', 'ad_click')
  AND project_id = 'proj_123'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY event_data->>'position';
```

### Top Performing Ads by Creative
```sql
SELECT 
    event_data->>'creative_id' as creative_id,
    event_data->>'size' as ad_size,
    COUNT(*) FILTER (WHERE event_type = 'ad_impression') as impressions,
    COUNT(*) FILTER (WHERE event_type = 'ad_click') as clicks,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE event_type = 'ad_click') / 
        NULLIF(COUNT(*) FILTER (WHERE event_type = 'ad_impression'), 0), 
        2
    ) as ctr
FROM analytics_events
WHERE event_type IN ('ad_impression', 'ad_click')
  AND project_id = 'proj_123'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY event_data->>'creative_id', event_data->>'size'
ORDER BY clicks DESC
LIMIT 10;
```

## Testing

### Local Testing with Mock Data

1. Start the development server:
```bash
node server.js
```

2. Open the test page: `http://localhost:3000/test/index.html`

3. Add debug parameter to enable logging: `http://localhost:3000/test/index.html?diveeDebug=true`

4. Open browser console to see analytics events:
```
[Divee Analytics] ad_impression { ad_unit: 'div-gpt-ad-1768979426842-0', ... }
[Divee Analytics] ad_click { ad_unit: 'div-gpt-ad-1768979426842-0', click_x: 450, ... }
```

### Production Testing

Ensure the Supabase Edge Function is deployed:

```bash
supabase functions deploy analytics
```

Verify events are being logged:

```sql
SELECT * FROM analytics_events 
WHERE event_type IN ('ad_impression', 'ad_click')
ORDER BY created_at DESC 
LIMIT 10;
```

## Privacy Considerations

- Visitor IDs are generated client-side and stored in localStorage
- Session IDs are stored in sessionStorage and reset per browsing session
- No personally identifiable information (PII) is collected
- IP addresses are used only for geo-location and not stored permanently
- Ad click coordinates are relative to viewport, not absolute screen position

## Future Enhancements

1. **Viewability Tracking**: Track whether ads are actually visible in viewport
2. **Engagement Time**: Measure how long ads are visible before click
3. **A/B Testing**: Support for testing different ad placements
4. **Fraud Detection**: Identify suspicious click patterns
5. **Real-time Dashboard**: Live ad performance monitoring

## Related Documentation

- [Analytics Data Model](../product/analytics-model.md)
- [Technical Specification](../product/technical-spec.md)
- [Widget API Reference](./widget-api.md)
