# Token Usage Tracking

This document explains the token usage tracking system implemented for tracking AI API costs per project.

## Overview

Token usage is automatically tracked for all AI API calls (chat and suggestions endpoints) and stored in a database table. This allows for efficient querying and cost analysis.

## Database Schema

### Main Table: `token_usage`

**Columns:**
- `id` - Auto-incrementing identifier
- `project_id` - Project identifier (links to `project` table)
- `conversation_id` - Optional conversation ID for chat tracking
- `visitor_id` - Visitor UUID
- `session_id` - Session UUID
- `input_tokens` - Number of input tokens (prompt)
- `output_tokens` - Number of output tokens (completion)
- `total_tokens` - Auto-calculated sum (generated column)
- `model` - AI model used (e.g., 'gpt-4', 'deepseek-chat')
- `endpoint` - API endpoint ('chat' or 'suggestions')
- `metadata` - JSONB field for additional context
- `created_at` - Timestamp of the API call

### Views

**`token_usage_daily`** - Daily aggregations per project:
```sql
SELECT * FROM token_usage_daily 
WHERE project_id = 'your-project-id' 
  AND usage_date >= CURRENT_DATE - 30
ORDER BY usage_date DESC;
```

**`token_usage_monthly`** - Monthly aggregations per project:
```sql
SELECT * FROM token_usage_monthly 
WHERE project_id = 'your-project-id'
ORDER BY month_start DESC;
```

## Querying Token Usage

### Get Today's Usage by Project
```sql
SELECT 
  project_id, 
  SUM(total_tokens) as total_tokens,
  SUM(input_tokens) as input_tokens,
  SUM(output_tokens) as output_tokens,
  COUNT(*) as request_count
FROM token_usage 
WHERE usage_date = CURRENT_DATE 
GROUP BY project_id;
```

### Get Usage for Specific Project (Last 30 Days)
```sql
SELECT * FROM token_usage_daily 
WHERE project_id = 'your-project-id' 
  AND usage_date >= CURRENT_DATE - 30
ORDER BY usage_date DESC;
```

### Get Usage by Endpoint
```sql
SELECT 
  endpoint,
  COUNT(*) as requests,
  SUM(total_tokens) as total_tokens,
  AVG(total_tokens) as avg_tokens_per_request
FROM token_usage
WHERE project_id = 'your-project-id'
  AND usage_date >= CURRENT_DATE - 7
GROUP BY endpoint;
```

### Get Top Projects by Token Usage (This Month)
```sql
SELECT 
  project_id,
  SUM(total_tokens) as total_tokens,
  SUM(input_tokens) as total_input,
  SUM(output_tokens) as total_output,
  COUNT(*) as total_requests
FROM token_usage
WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY project_id
ORDER BY total_tokens DESC
LIMIT 10;
```

### Get Usage with Cost Estimation
```sql
-- Assuming $0.10 per 1K input tokens, $0.30 per 1K output tokens
SELECT 
  project_id,
  DATE(created_at) as usage_date,
  SUM(input_tokens) as input_tokens,
  SUM(output_tokens) as output_tokens,
  SUM(total_tokens) as total_tokens,
  ROUND((SUM(input_tokens)::numeric / 1000 * 0.10) + 
        (SUM(output_tokens)::numeric / 1000 * 0.30), 2) as estimated_cost_usd
FROM token_usage
WHERE created_at >= CURRENT_DATE - 30
GROUP BY project_id, DATE(created_at)
ORDER BY usage_date DESC, estimated_cost_usd DESC;
```

### Get Conversation-Level Usage
```sql
SELECT 
  conversation_id,
  COUNT(*) as turns,
  SUM(total_tokens) as conversation_tokens,
  MAX(created_at) as last_message
FROM token_usage
WHERE project_id = 'your-project-id'
  AND conversation_id IS NOT NULL
  AND created_at >= CURRENT_DATE - 7
GROUP BY conversation_id
ORDER BY last_message DESC;
```

## Application Integration

Token usage is automatically tracked in the Edge Functions:

### Chat Endpoint
Tracks tokens for each Q&A interaction, linked to:
- Project ID
- Conversation ID
- Visitor and Session IDs
- Metadata includes question ID, question type, and article URL

### Suggestions Endpoint
Tracks tokens for suggestion generation, linked to:
- Project ID
- Visitor and Session IDs
- Metadata includes article URL, article ID, and language

## Performance Considerations

1. **Indexes**: Pre-created indexes on project_id, conversation_id, visitor_id, and created_at
2. **Batch Queries**: Use the daily/monthly views for aggregated data instead of scanning raw records
3. **Date Filters**: Always include date filters in WHERE clauses for optimal performance

## Data Retention

To maintain performance and manage storage, periodically delete old records:

```sql
-- Delete records older than 90 days
DELETE FROM token_usage 
WHERE created_at < CURRENT_DATE - INTERVAL '90 days';

-- Or for specific project
DELETE FROM token_usage 
WHERE project_id = 'your-project-id' 
  AND created_at < CURRENT_DATE - INTERVAL '90 days';
```

## Troubleshooting

### Partition Not Found Error
If you see an error like "no partition of relation token_usage found for row", create the partition manually:
```sql
SELECT create_token_usage_partition(CURRENT_DATE);
```

### Missing Token Usage Data
ChecMissing Token Usage Data
Check if token usage is being captured from AI provider:
```sql
-- Check recent records
SELECT * FROM token_usage 
ORDER BY created_at DESC 
LIMIT 10;
```

If `input_tokens` and `output_tokens` are 0, verify:
1. AI provider is returning usage data in API response
2. The `readDeepSeekStreamAndCollectAnswer` function is capturing usage from stream