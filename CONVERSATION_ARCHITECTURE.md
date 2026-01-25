## Plan: Conversational AI with Abuse Protection

Add conversation threading, message history persistence to transform the current single-Q&A system into a stateful conversational experience while enabling conversation analytics.


### Architecture Overview

**Conversation Scope**: Per visitor + per article (each article has its own conversation thread)
**Character Management**: FIFO message pruning when exceeding 100k characters, article context included only once

---

### Steps

#### 1. Create Conversation Database Schema

Create new migration file in `supabase/migrations/` with:

**`conversations` table:**
```sql
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  article_unique_id text NOT NULL,
  visitor_id uuid NOT NULL,
  session_id uuid NOT NULL,
  article_title text NOT NULL,
  article_content text NOT NULL,
  messages jsonb DEFAULT '[]'::jsonb,
  started_at timestamp DEFAULT now(),
  last_message_at timestamp DEFAULT now(),
  message_count int DEFAULT 0,
  total_chars int DEFAULT 0,
  UNIQUE(visitor_id, article_unique_id, project_id),
  FOREIGN KEY (article_unique_id) REFERENCES article(unique_id) ON DELETE CASCADE
);

CREATE INDEX idx_conversations_visitor_article ON conversations(visitor_id, article_unique_id);
CREATE INDEX idx_conversations_session ON conversations(session_id);
CREATE INDEX idx_conversations_project ON conversations(project_id);

-- IMPORTANT: No RLS policies on conversations table
-- This table is BACKEND ONLY - accessed via Edge Functions with service role key
-- Never expose to client-side queries for security
```

**Security Notes:**
- ⚠️ **No Row Level Security (RLS)** policies on `conversations` table
- ✅ **Backend-only access** via Edge Functions using `SUPABASE_SERVICE_ROLE_KEY`
- ✅ **Never query directly from client** - all access through API endpoints
- ✅ Prevents unauthorized access to conversation history
- ✅ Protects article content from direct extraction

**Message Object Structure (in JSONB array):**

Update `supabase/functions/chat/index.ts`:

**New Request Fields:**
```typescript
{
  projectId: string,
  questionId: string,
  question: string,
  title: string,
  content: string,
  url: string,
  visitor_id: string,
  session_id: string,
  conversation_id?: string  // NEW: Optional, auto-create if missing
}
```

**Flow Changes:**

1. **Get or Create Conversation**
   ```typescript
   // Using service role key - conversations table has NO RLS
   let conversation = await supabase
     .from('conversations')
     .select('*')
     .eq('visitor_id', visitor_id)
     .eq('article_unique_id', articleUniqueId)
     .eq('project_id', projectId)
     .single()
   
   if (!conversation) {
     conversation = await createConversation(
       visitor_id, 
       articleUniqueId, 
       projectId, 
       session_id,
       title,  // Store article title
       content // Store article content
     )
   }
   
   // Check conversation message limit
   if (conversation.message_count >= 20) {
     return new Response('Conversation limit reached', { status: 429 })
   }
   ```

3. **Character-Based Message Pruning (FIFO)**
   ```typescript
   // Use article content stored in conversation (not from request)
   const articleTitle = conversation.article_title
   const articleContent = conversation.article_content
   const messages = conversation.messages || [] // JSONB array
   
   const ARTICLE_CHARS = (articleTitle + articleContent).length // ~20k chars typically
   const MAX_CONVERSATION_CHARS = 200000 // 200k characters (~50k tokens)
   const AVAILABLE_CHARS = MAX_CONVERSATION_CHARS - ARTICLE_CHARS
   
   let totalChars = 0
   const prunedMessages = []
   
   // Read messages from END (newest first), keep until hitting char limit
   for (let i = messages.length - 1; i >= 0; i--) {
     totalChars += messages[i].char_count
     if (totalChars <= AVAILABLE_CHARS) {
       prunedMessages.unshift(messages[i]) // Add to beginning
     } else {
       break // Drop older messages
     }
   }
   ```

4. **Build AI Context**
   ```typescript
   const aiMessages = [
     {
       role: 'system',
       content: systemPrompt
     },
     {
       role: 'user',
       content: `[Article Context - Reference for all questions]\nTitle: ${articleTitle}\n\nContent: ${articleContent}`
     },
     ...prunedMessages.map(m => ({ role: m.role, content: m.content })),
     {
       role: 'user',
       content: question
     }
   ]
   
   // NOTE: Article context is built into AI request but NOT stored in messages table
   // This keeps client UI clean and avoids redundant storage
   ```

6. **Stream Answer & Store Messages**
   ```typescript
   const stream = await streamAnswer(aiMessages) // Modified to accept message array
   
   // Store ONLY user question (not article context)
   await storeMessage(conversation.id, 'user', question)
   
   // Collect streamed response
   let fullAnswer = ''
   for await (const chunk of stream) {
     fullAnswer += chunk
     // Stream to client
   }
   
   // Store ONLY assistant answer
   await storeMessage(conversation.id, 'assistant', fullAnswer)
   
   // Update conversation metadata
   await updateConversation(conversation.id, {
     last_message_at: new Date(),
     message_count: conversation.message_count + 2,
     total_chars: conversation.total_chars + question.length + fullAnswer.length
   })
   
   // Return conversation ID to client via header
   response.headers.set('X-Conversation-Id', conversation.id)
   ```

---

#### 4. Update AI Module for Message History Support

Modify `supabase/functions/_shared/ai.ts`:

**Change function signature:**
```typescript
// OLD
async function streamAnswer(title: string, content: string, question: string)

// NEW
async function streamAnswer(messages: Array<{role: string, content: string}>)
```

**Update DeepSeek API call:**
```typescript
const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${DEEPSEEK_API}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'deepseek-chat',
    messages: messages, // Pass directly
    temperature: 0.4,
    max_tokens: 4000,
    stream: true
  })
})
```

**No token estimation needed - using character counts directly**
```typescript
// Simply use content.length for character counting
// Much faster and simpler than token estimation
```

---

#### 5. Add Conversation Management Endpoints

Create `supabase/functions/conversations/index.ts`:

**Security**: All endpoints use `SUPABASE_SERVICE_ROLE_KEY` to query conversations table (no RLS)

**Endpoints:**

**GET /conversations**
```typescript
// List all conversations for a visitor
Query params: visitor_id, project_id
Response: [
  {
    id: uuid,
    article_title: string,
    article_url: string,
    last_message_at: timestamp,
    message_count: number
  }
]
```

**GET /conversations/:id/messages**
```typescript
// Get full message history for a conversation
// Simply return the messages array from conversation
Response: [
  {
    role: 'user' | 'assistant',
    content: string,
    char_count: number,
    created_at: string
  }
]
```
```

**POST /conversations/reset**
```typescript
// Start new conversation for same article (clear messages array)
Body: { visitor_id, article_unique_id, project_id }
Action: Set messages = [], message_count = 0, total_chars = 0
Response: { conversation_id: uuid }
```

**DELETE /conversations/:id**
```typescript
// Delete entire conversation
Response: { success: true }
```

---

#### 6. Update Widget for Conversation Persistence

Modify `src/widget.js`:

**On widget initialization:**
```javascript
// Store conversation ID per article
const conversationKey = `divee_conversation_${this.articleUrl}`
this.conversationId = sessionStorage.getItem(conversationKey)
```

**On first message in new session:**
```javascript
async sendMessage(question) {
  const response = await fetch('/api/v1/chat', {
    method: 'POST',
    body: JSON.stringify({
      projectId: this.projectId,
      questionId: this.questionId,
      question: question,
      title: this.articleTitle,
      content: this.articleContent,
      url: this.articleUrl,
      visitor_id: this.visitorId,
      session_id: this.sessionId,
      conversation_id: this.conversationId // Include if exists
    })
  })
  
  // Store conversation ID from response
  const conversationId = response.headers.get('X-Conversation-Id')
  if (conversationId) {
    sessionStorage.setItem(conversationKey, conversationId)
    this.conversationId = conversationId
  }
}
```

**Add "New Conversation" UI:**
```javascript
addResetButton() {
  const resetBtn = document.createElement('button')
  resetBtn.textContent = '🔄 New Conversation'
  resetBtn.className = 'divee-reset-conversation'
  resetBtn.onclick = () => this.resetConversation()
  this.container.querySelector('.divee-header').appendChild(resetBtn)
}

async resetConversation() {
  // Clear local conversation ID
  const conversationKey = `divee_conversation_${this.articleUrl}`
  sessionStorage.removeItem(conversationKey)
  this.conversationId = null
  
  // Clear UI messages
  this.state.messages = []
  this.renderMessages()
  
  // Optional: Delete on server
  if (this.conversationId) {
    await fetch(`/api/v1/conversations/${this.conversationId}`, { method: 'DELETE' })
  }
}
```

**Load conversation history on expand:**
```javascript
async loadConversationHistory() {
  if (!this.conversationId) return
  
  const response = await fetch(`/api/v1/conversations/${this.conversationId}/messages`)
  const messages = await response.json()
  
  // Messages contain only user questions and AI answers
  // Article context is NOT included (stored separately in conversation.article_content)
  // Messages come from conversation.messages JSONB array
  this.state.messages = messages
  this.renderMessages()
}
```

---

#### 7. Add Conversation Analytics Events

Extend `supabase/functions/_shared/analytics.ts` to track:

**New Event Types:**
```typescript
'conversation_started'    // First message in new conversation
'conversation_continued'  // Message in existing conversation  
'conversation_reset'      // User clicked "New Conversation"
'conversation_pruned'     // Messages dropped due to character limit
```

**Event Data:**
```typescript
{
  conversation_id: uuid,
  message_count: number,
  total_chars: number,
  messages_pruned?: number,
  conversation_age_seconds?: number
}
```

**Add to dashboard queries:**
- Average messages per conversation
- Conversation depth distribution (1-5, 6-10, 11-15, 16-20)
- Character usage per conversation
- Most active conversation times

---

### Implementation Notes

#### Character Management Strategy

1. **Article content stored in `conversations` table** (not in `messages` table)
2. **Article context built into AI request ONCE** at position 2 (after system prompt)
3. **Only user/assistant messages stored in `messages` table** and displayed to client
4. **When pruning**: Keep article context + most recent N messages that fit in remaining characters
5. **Example with 200k character limit (~50k tokens):**
   - System prompt: ~800 characters
   - Article context: ~20,000 characters (fixed, from conversations.article_content)
   - Available for history: ~179,200 characters
   - If history exceeds 179k chars, drop oldest messages (FIFO)
6. **Benefits:**
   - Simpler implementation (no token estimation needed)
   - Fast computation (just string.length)
   - Single atomic update (no JOINs needed)
   - Messages always fetched with conversation (no separate query)
   - Article context sent to AI on every request but not stored repeatedly
   - Clean client UI without redundant article display
   - Single source of truth for article content per conversation
   - JSONB array perfect for max 20 messages use case

#### IP Address Extraction Priority

```typescript
function getClientIP(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||      // Cloudflare
    request.headers.get('x-real-ip') ||             // Nginx
    request.headers.get('x-forwarded-for')?.split(',')[0] || // Standard proxy
    'unknown'
  )
}
```

#### Rate Limit Response Format

```typescript
{
  error: 'Rate limit exceeded',
  limit: 100,
  window: '15 minutes',
  retry_after: 420  // seconds
}
```

#### Conversation Cleanup Job

Create scheduled function `supabase/functions/cleanup-conversations/index.ts`:
- Runs daily at 2 AM
- Deletes conversations older than 7 days with no activity
- Archives high character count conversations for cost analysis

---

### Testing Checklist

- [ ] Create new conversation on first message
- [ ] Reuse conversation for same visitor + article
- [ ] Different articles = different conversations
- [ ] Message history persisted in JSONB array
- [ ] Messages array retrieved correctly across page reloads
- [ ] Character pruning works correctly (keeps article + recent messages)
- [ ] "New Conversation" button clears messages array
- [ ] Analytics events tracked correctly
- [ ] Conversation list endpoint returns correct data
- [ ] JSONB array handles 20+ messages without issues

---

### Further Considerations

1. **Conversation Expiration** - Should conversations auto-expire after X hours of inactivity? Recommend 24-hour soft expiry (hidden from UI but data retained for 7 days for analytics).

2. **Cross-Session Conversations** - Currently scoped to sessionStorage. Should conversations persist across browser restarts via localStorage + visitor_id? This would allow users to continue conversations days later.

3. **Conversation Export** - Should users be able to export their conversation history (for sharing, copying, or saving)? Simple JSON download or formatted text?

4. **Admin Dashboard** - Do you need internal tools to view/moderate conversations? Check for abuse patterns, review flagged content, or analyze conversation quality?

5. **Message Editing/Deletion** - Should users be able to delete individual messages or edit their questions? Would require re-generating responses and handling conversation continuity.

---

### Migration Risk Assessment

**Low Risk:**
- New tables won't affect existing functionality
- Chat endpoint changes are backward compatible (conversation_id optional)
- Widget changes are additive (existing Q&A still works)

**Medium Risk:**
- Rate limiting could block legitimate users if thresholds too strict
- Token pruning logic could be buggy (test thoroughly with edge cases)
- IP extraction might fail behind certain proxies/CDNs

**High Risk:**
- Database constraints (UNIQUE on visitor_id + article_id) could cause race conditions if multiple tabs open
- Conversation ID storage in sessionStorage means loss on tab close (consider localStorage for persistence)

**Recommended Rollout:**
1. Deploy database changes first
2. Enable conversation storage but keep single-Q&A behavior as default
3. Add conversation UI behind feature flag
4. Enable rate limiting with generous limits (monitor)
5. Gradually tighten limits based on abuse patterns
