-- Drop existing public access policies
-- All access must now go through edge functions which use service_role
DROP POLICY IF EXISTS "Allow public read access" ON public.project;
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.project;
DROP POLICY IF EXISTS "Allow authenticated update" ON public.project;
