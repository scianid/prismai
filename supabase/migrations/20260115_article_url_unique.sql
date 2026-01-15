-- Ensure article URL is unique and indexed
ALTER TABLE public.article
  ADD CONSTRAINT article_url_unique UNIQUE (url);

-- Explicit index for faster lookups by url (unique constraint already creates one)
CREATE INDEX IF NOT EXISTS idx_article_url ON public.article (url);