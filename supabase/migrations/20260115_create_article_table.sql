-- Create article table for storing extracted content
CREATE TABLE IF NOT EXISTS public.article (
  url TEXT,
  title TEXT,
  content TEXT,
  cache JSONB,
  project_id TEXT
);