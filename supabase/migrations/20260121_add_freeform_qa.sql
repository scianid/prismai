-- Create table for free-form questions and answers
CREATE TABLE public.freeform_qa (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  project_id text NOT NULL,
  article_unique_id text NOT NULL,
  visitor_id uuid,
  session_id uuid,
  question text NOT NULL,
  answer text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT freeform_qa_pkey PRIMARY KEY (id),
  CONSTRAINT freeform_qa_article_unique_id_fkey FOREIGN KEY (article_unique_id) REFERENCES public.article(unique_id) ON DELETE CASCADE
);

-- Create indexes for common queries
CREATE INDEX idx_freeform_qa_project_id ON public.freeform_qa(project_id);
CREATE INDEX idx_freeform_qa_article_unique_id ON public.freeform_qa(article_unique_id);
CREATE INDEX idx_freeform_qa_visitor_id ON public.freeform_qa(visitor_id);
CREATE INDEX idx_freeform_qa_session_id ON public.freeform_qa(session_id);
CREATE INDEX idx_freeform_qa_created_at ON public.freeform_qa(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.freeform_qa ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (adjust based on your security needs)
CREATE POLICY "Allow all operations on freeform_qa" ON public.freeform_qa
  FOR ALL
  USING (true)
  WITH CHECK (true);
