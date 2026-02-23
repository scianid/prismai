## Plan: Rate Limiting Implementation

IP-based rate limiting system to prevent abuse of the conversational AI feature while allowing legitimate usage.

### Architecture Overview

**Approach**: IP-based throttling with multiple tiers
**Storage**: Dedicated `rate_limits` table with sliding window
**Response**: HTTP 429 with `Retry-After` header

---

### Database Schema

Create new migration file in `supabase/migrations/`:

**`rate_limits` table:**
```sql
CREATE TABLE rate_limits (
  id bigserial PRIMARY KEY,
  ip_address inet NOT NULL,
  project_id text NOT NULL,
  request_count int DEFAULT 1,
  window_start timestamp DEFAULT now(),
  last_request_at timestamp DEFAULT now(),
  UNIQUE(ip_address, project_id)
);

CREATE INDEX idx_rate_limits_ip_project ON rate_limits(ip_address, project_id);
CREATE INDEX idx_rate_limits_window ON rate_limits(window_start);
```

---

### Rate Limit Tiers

**Per IP + Project**: 100 requests / 15 minutes
**Per Conversation**: 20 messages max (enforced separately in conversation table)
**Per Visitor + Project**: 10 new conversations / day
**Burst Protection**: Max 5 requests / 30 seconds

---

### Implementation

#### 1. Create Rate Limiting Middleware

Create `supabase/functions/_shared/rate-limiter.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

interface RateLimitResult {
  allowed: boolean
  retryAfter?: number // seconds
  limit?: number
  remaining?: number
}

/**
 * Check if request is within rate limits
 */
export async function checkRateLimit(
  ip: string,
  projectId: string,
  conversationId?: string
): Promise<RateLimitResult> {
  
  const now = new Date()
  const windowStart = new Date(now.getTime() - 15 * 60 * 1000) // 15 minutes ago
  
  // Get or create rate limit record
  const { data: record, error } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('ip_address', ip)
    .eq('project_id', projectId)
    .single()
  
  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    console.error('Rate limit check error:', error)
    return { allowed: true } // Fail open on errors
  }
  
  if (!record) {
    // First request from this IP+project
    await supabase
      .from('rate_limits')
      .insert({
        ip_address: ip,
        project_id: projectId,
        request_count: 1,
        window_start: now.toISOString(),
        last_request_at: now.toISOString()
      })
    
    return { allowed: true, limit: 100, remaining: 99 }
  }
  
  // Check if window has expired (reset counter)
  const windowAge = now.getTime() - new Date(record.window_start).getTime()
  const windowExpired = windowAge > 15 * 60 * 1000 // 15 minutes
  
  if (windowExpired) {
    // Reset window
    await supabase
      .from('rate_limits')
      .update({
        request_count: 1,
        window_start: now.toISOString(),
        last_request_at: now.toISOString()
      })
      .eq('id', record.id)
    
    return { allowed: true, limit: 100, remaining: 99 }
  }
  
  // Check burst protection (5 requests in 30 seconds)
  const timeSinceLastRequest = now.getTime() - new Date(record.last_request_at).getTime()
  if (timeSinceLastRequest < 6000 && record.request_count >= 5) { // 6 seconds average = 10 req/min
    const retryAfter = Math.ceil((6000 - timeSinceLastRequest) / 1000)
    return { 
      allowed: false, 
      retryAfter,
      limit: 100,
      remaining: 0
    }
  }
  
  // Check main limit (100 requests per 15 minutes)
  if (record.request_count >= 100) {
    const windowRemaining = 15 * 60 * 1000 - windowAge
    const retryAfter = Math.ceil(windowRemaining / 1000)
    return { 
      allowed: false, 
      retryAfter,
      limit: 100,
      remaining: 0
    }
  }
  
  // Increment counter
  await supabase
    .from('rate_limits')
    .update({
      request_count: record.request_count + 1,
      last_request_at: now.toISOString()
    })
    .eq('id', record.id)
  
  return { 
    allowed: true,
    limit: 100,
    remaining: 100 - record.request_count - 1
  }
}

/**
 * Cleanup expired rate limit records (call periodically)
 */
export async function cleanupExpiredLimits(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
  
  await supabase
    .from('rate_limits')
    .delete()
    .lt('last_request_at', cutoff.toISOString())
}

/**
 * Get client IP from request headers
 */
export function getClientIP(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||      // Cloudflare
    request.headers.get('x-real-ip') ||             // Nginx
    request.headers.get('x-forwarded-for')?.split(',')[0] || // Standard proxy
    'unknown'
  )
}
```

---

#### 2. Integrate Rate Limiting into Chat Endpoint

Update `supabase/functions/chat/index.ts`:

Add at the **very beginning** of request handling:

```typescript
import { checkRateLimit, getClientIP } from '../_shared/rate-limiter.ts'

// ... inside serve handler ...

// 1. RATE LIMIT CHECK (FIRST)
const clientIP = getClientIP(req)
const rateCheck = await checkRateLimit(clientIP, projectId)

if (!rateCheck.allowed) {
  return new Response(
    JSON.stringify({
      error: 'Rate limit exceeded',
      message: 'Too many requests. Please try again later.',
      limit: rateCheck.limit,
      retry_after: rateCheck.retryAfter
    }),
    { 
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(rateCheck.retryAfter),
        'X-RateLimit-Limit': String(rateCheck.limit),
        'X-RateLimit-Remaining': '0'
      }
    }
  )
}

// Track rate limit hit in analytics
await trackEvent({
  project_id: projectId,
  visitor_id,
  session_id,
  event_type: 'rate_limit_hit',
  event_data: {
    ip: clientIP,
    retry_after: rateCheck.retryAfter
  }
})

// Continue with normal chat endpoint logic...
```

---

#### 3. Add Rate Limit Analytics Events

Extend `supabase/functions/_shared/analytics.ts`:

**New Event Type:**
```typescript
'rate_limit_hit'  // User hit rate limit
```

**Event Data:**
```typescript
{
  ip: string,
  retry_after: number,
  limit: number,
  endpoint: string // 'chat' | 'suggestions' | etc
}
```

---

#### 4. Create Cleanup Cron Job

Create `supabase/functions/cleanup-rate-limits/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { cleanupExpiredLimits } from '../_shared/rate-limiter.ts'

serve(async (req) => {
  try {
    // Verify this is a cron request
    const authHeader = req.headers.get('authorization')
    const cronSecret = Deno.env.get('CRON_SECRET')
    
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      return new Response('Unauthorized', { status: 401 })
    }
    
    await cleanupExpiredLimits()
    
    return new Response(
      JSON.stringify({ success: true, message: 'Cleanup completed' }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Cleanup error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
})
```

**Setup cron trigger** in Supabase dashboard or via CLI:
```bash
# Run cleanup daily at 3 AM
supabase functions schedule cleanup-rate-limits --cron "0 3 * * *"
```

---

#### 5. Widget: Display Rate Limit Errors

Update `src/widget.js` to handle 429 responses:

```javascript
async sendMessage(question) {
  try {
    const response = await fetch('/api/v1/chat', {
      method: 'POST',
      body: JSON.stringify({
        // ... existing fields
      })
    })
    
    if (response.status === 429) {
      const error = await response.json()
      const retryAfter = response.headers.get('Retry-After')
      
      this.showRateLimitError(error.message, retryAfter)
      return
    }
    
    // ... continue normal flow
  } catch (error) {
    console.error('Send message error:', error)
  }
}

showRateLimitError(message, retryAfter) {
  const errorDiv = document.createElement('div')
  errorDiv.className = 'divee-rate-limit-error'
  errorDiv.innerHTML = `
    <strong>⏱️ Rate Limit Reached</strong>
    <p>${message}</p>
    <p>Please wait ${this.formatRetryTime(retryAfter)} before trying again.</p>
  `
  
  this.container.querySelector('.divee-messages').appendChild(errorDiv)
}

formatRetryTime(seconds) {
  if (seconds < 60) return `${seconds} seconds`
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} minute${minutes > 1 ? 's' : ''}`
}
```

---

### Configuration & Tuning

**Environment Variables:**
```env
# Adjust limits per environment
RATE_LIMIT_REQUESTS_PER_WINDOW=100
RATE_LIMIT_WINDOW_MINUTES=15
RATE_LIMIT_BURST_REQUESTS=5
RATE_LIMIT_BURST_SECONDS=30
```

**Recommended Limits by Plan:**

| Tier | Requests/15min | Burst | Conversations/day |
|------|----------------|-------|-------------------|
| Free | 50 | 3 | 5 |
| Basic | 100 | 5 | 10 |
| Pro | 500 | 10 | 50 |
| Enterprise | Unlimited | 20 | Unlimited |

---

### Testing Checklist

- [ ] Rate limiting blocks after 100 requests
- [ ] Rate limiting resets after 15-minute window
- [ ] Burst protection triggers on rapid requests
- [ ] 429 response includes correct headers (Retry-After, X-RateLimit-*)
- [ ] Widget displays user-friendly error message
- [ ] Analytics tracks rate_limit_hit events
- [ ] Cleanup job removes old records
- [ ] IP extraction works behind Cloudflare/proxies
- [ ] Multiple projects have separate rate limits
- [ ] Legitimate traffic not blocked during normal use

---

### Monitoring & Alerts

**Metrics to track:**
- Rate limit hit rate (should be <1% of requests)
- Most frequently limited IPs (potential abuse)
- Average requests per IP per day
- P99 retry_after times

**Alert thresholds:**
- >5% of requests hitting rate limits → Limits may be too strict
- Single IP >1000 requests/day → Potential abuse/bot
- Spike in rate_limit_hit events → DDoS attempt

---

### Progressive Rollout Strategy

**Phase 1: Logging Only**
- Deploy rate limiter but don't enforce (log violations)
- Monitor false positive rate
- Tune thresholds based on real traffic

**Phase 2: Soft Limits**
- Enforce with generous limits (200 req/15min)
- Allow 10% overage for legitimate bursts
- Monitor user complaints

**Phase 3: Production Limits**
- Reduce to target limits (100 req/15min)
- Enable all enforcement mechanisms
- Add IP allowlist for known partners

**Phase 4: Dynamic Limits**
- Adjust limits based on subscription tier
- Implement per-project custom limits
- Add reputation-based scoring

---

### Edge Cases

**Multiple users behind NAT/proxy:**
- Consider combining IP + visitor_id for finer granularity
- Add IP range allowlists for corporate networks

**Cloudflare/CDN:**
- Prefer `cf-connecting-ip` header (actual client IP)
- Fallback to `x-forwarded-for` for other CDNs

**Legitimate power users:**
- Add IP allowlist in project settings
- Implement API key system for known integrations

**Race conditions:**
- Use database-level transactions for counter increments
- Accept slight over-limit during high concurrency
