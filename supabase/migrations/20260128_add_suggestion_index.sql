-- Add suggestion_index column to conversations table
-- Tracks which article in the rotation to show next

ALTER TABLE conversations 
ADD COLUMN suggestion_index INTEGER DEFAULT 0;

COMMENT ON COLUMN conversations.suggestion_index IS 'Counter for round-robin article suggestions. Increments after each suggestion shown.';

-- Index for efficient lookups
CREATE INDEX idx_conversations_suggestion_index ON conversations(suggestion_index);
