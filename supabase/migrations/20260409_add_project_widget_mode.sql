-- Add widget_mode column to project table.
-- 'article' (default): existing behavior — extracts article content, sends to AI.
-- 'knowledgebase': answers only from RAG documents, no article content required.
ALTER TABLE public.project ADD COLUMN IF NOT EXISTS widget_mode TEXT NOT NULL DEFAULT 'article';
