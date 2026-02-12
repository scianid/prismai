-- Update conversations unique constraint to include session_id
-- This allows multiple conversations for the same visitor on the same article
-- (one per session/page load)

-- Drop the old constraint
ALTER TABLE conversations 
DROP CONSTRAINT IF EXISTS conversations_visitor_id_article_unique_id_project_id_key;

-- Add new constraint including session_id
ALTER TABLE conversations 
ADD CONSTRAINT conversations_visitor_article_session_project_key 
UNIQUE(visitor_id, article_unique_id, session_id, project_id);

COMMENT ON CONSTRAINT conversations_visitor_article_session_project_key ON conversations 
IS 'Ensures one conversation per visitor per article per session';
