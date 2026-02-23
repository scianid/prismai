# Conversation Feature - Deployment Steps

## Issues Fixed

1. **articleUniqueId format mismatch**: Fixed to match article table format (no dash between url and projectId)
2. **Foreign key constraint**: Ensured article is created before conversation
3. **Error handling**: Improved PGRST116 (not found) error handling in conversationDao

## Migration Status

The migration file exists at:
`supabase/migrations/20260125_create_conversations.sql`

### To Apply Migration

**Option 1: Via Supabase Dashboard**
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy contents of `20260125_create_conversations.sql`
4. Execute the SQL

**Option 2: Via Supabase CLI** (if installed)
```bash
supabase db push
```

## Testing Checklist

After applying migration:

1. **Test conversation creation**
   - Ask first question on an article
   - Check browser DevTools → Network → chat request → Response Headers for `X-Conversation-Id`
   - Check browser DevTools → Application → Session Storage for `divee_conversation_<url>` key

2. **Test conversation persistence**
   - Ask 2-3 follow-up questions on same article
   - Refresh page and ask another question
   - Should maintain conversation history

3. **Query database directly**
   ```sql
   SELECT id, visitor_id, article_unique_id, message_count, total_chars 
   FROM conversations 
   ORDER BY last_message_at DESC 
   LIMIT 10;
   
   -- Check messages array
   SELECT id, messages FROM conversations WHERE message_count > 0 LIMIT 1;
   ```

4. **Test conversation limit**
   - Ask 20 questions (should work)
   - Try 21st question (should return 429 error)

5. **Test character pruning**
   - Create long conversation (>100k chars total)
   - Verify older messages are pruned but recent ones remain

## Common Issues

### Conversations not being created
- Check Supabase Edge Function logs for errors
- Verify `article` table has matching record
- Check foreign key constraint errors

### Conversation ID not persisting
- Check sessionStorage in browser DevTools
- Verify `X-Conversation-Id` header is being returned
- Ensure no CORS issues blocking headers

### Messages not appending
- Check `appendMessagesToConversation` logs
- Verify JSONB format is correct
- Check for race conditions (multiple rapid requests)

## Files Modified

1. `supabase/migrations/20260125_create_conversations.sql` - NEW
2. `supabase/functions/_shared/ai.ts` - Updated for message arrays
3. `supabase/functions/_shared/dao/conversationDao.ts` - NEW
4. `supabase/functions/chat/index.ts` - Major conversation logic
5. `supabase/functions/conversations/index.ts` - NEW endpoints
6. `src/widget.js` - Conversation ID tracking
