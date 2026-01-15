-- Enable Row Level Security for article table
ALTER TABLE public.article ENABLE ROW LEVEL SECURITY;

-- No public policies - all access must go through edge functions
-- Edge functions use service_role which bypasses RLS