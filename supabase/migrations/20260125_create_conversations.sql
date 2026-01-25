-- Create conversations table for conversational AI feature
-- Backend-only access (no RLS) - accessed via Edge Functions with service role key

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  article_unique_id text NOT NULL,
  visitor_id uuid NOT NULL,
  session_id uuid NOT NULL,
  article_title text NOT NULL,
  article_content text NOT NULL,
  messages jsonb DEFAULT '[]'::jsonb,
  started_at timestamp with time zone DEFAULT now(),
  last_message_at timestamp with time zone DEFAULT now(),
  message_count int DEFAULT 0,
  total_chars int DEFAULT 0,
  UNIQUE(visitor_id, article_unique_id, project_id),
  FOREIGN KEY (article_unique_id) REFERENCES article(unique_id) ON DELETE CASCADE
);

-- Indexes for efficient queries
CREATE INDEX idx_conversations_visitor_article ON conversations(visitor_id, article_unique_id);
CREATE INDEX idx_conversations_session ON conversations(session_id);
CREATE INDEX idx_conversations_project ON conversations(project_id);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);

-- IMPORTANT: No RLS policies on this table
-- Backend-only access via Edge Functions using SUPABASE_SERVICE_ROLE_KEY
-- This prevents unauthorized access to conversation history and article content

COMMENT ON TABLE conversations IS 'Stores conversation threads per visitor per article. Backend-only access, no RLS.';
COMMENT ON COLUMN conversations.messages IS 'JSONB array of {role, content, char_count, created_at} objects';
COMMENT ON COLUMN conversations.total_chars IS 'Sum of all message character counts for pruning decisions';
