-- Token usage tracking table (simplified, no partitioning)
-- Tracks input/output tokens per project for billing and analytics

CREATE TABLE public.token_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id text NOT NULL,
  conversation_id uuid,
  visitor_id uuid,
  session_id uuid,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  model text,
  endpoint text, -- e.g., 'chat', 'suggestions'
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indexes for efficient queries
CREATE INDEX idx_token_usage_project ON public.token_usage(project_id, created_at DESC);
CREATE INDEX idx_token_usage_conversation ON public.token_usage(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_token_usage_created_at ON public.token_usage(created_at DESC);
CREATE INDEX idx_token_usage_visitor ON public.token_usage(visitor_id, created_at DESC) WHERE visitor_id IS NOT NULL;

-- Create a view for daily aggregations
CREATE OR REPLACE VIEW public.token_usage_daily AS
SELECT 
  project_id,
  DATE(created_at) as usage_date,
  COUNT(*) as request_count,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(total_tokens) as total_tokens,
  AVG(input_tokens) as avg_input_tokens,
  AVG(output_tokens) as avg_output_tokens,
  COUNT(DISTINCT conversation_id) as unique_conversations,
  COUNT(DISTINCT visitor_id) as unique_visitors
FROM public.token_usage
GROUP BY project_id, DATE(created_at);

-- Create a view for monthly aggregations
CREATE OR REPLACE VIEW public.token_usage_monthly AS
SELECT 
  project_id,
  DATE_TRUNC('month', created_at) as month_start,
  COUNT(*) as request_count,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(total_tokens) as total_tokens,
  COUNT(DISTINCT conversation_id) as unique_conversations,
  COUNT(DISTINCT visitor_id) as unique_visitors
FROM public.token_usage
GROUP BY project_id, DATE_TRUNC('month', created_at);

-- Add comments for documentation
COMMENT ON TABLE public.token_usage IS 'Tracks token usage per project for billing and analytics.';
COMMENT ON COLUMN public.token_usage.input_tokens IS 'Number of tokens in the request/prompt';
COMMENT ON COLUMN public.token_usage.output_tokens IS 'Number of tokens in the response/completion';
COMMENT ON COLUMN public.token_usage.total_tokens IS 'Auto-calculated sum of input and output tokens';
COMMENT ON COLUMN public.token_usage.endpoint IS 'API endpoint used (chat, suggestions, etc.)';
COMMENT ON COLUMN public.token_usage.metadata IS 'Additional context (model version, duration, etc.)';

-- Example queries for reference:
-- 
-- Get today's usage by project:
-- SELECT project_id, SUM(total_tokens) as tokens FROM token_usage WHERE DATE(created_at) = CURRENT_DATE GROUP BY project_id;
-- 
-- Get usage for a specific project over last 30 days:
-- SELECT * FROM token_usage_daily WHERE project_id = 'your-project-id' AND usage_date >= CURRENT_DATE - 30;
-- 
-- Get monthly totals:
-- SELECT * FROM token_usage_monthly WHERE project_id = 'your-project-id' ORDER BY month_start DESC;
