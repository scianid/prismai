-- Create project table for widget configuration
CREATE TABLE IF NOT EXISTS public.project (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id VARCHAR(255) UNIQUE NOT NULL,
  position VARCHAR(50) DEFAULT 'bottom-right',
  primary_color VARCHAR(7) DEFAULT '#007bff',
  button_text VARCHAR(100) DEFAULT 'Chat with us',
  greeting_message TEXT DEFAULT 'Hello! How can we help you today?',
  api_endpoint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
-- All policies are restrictive - only service role (edge functions) can access
ALTER TABLE public.project ENABLE ROW LEVEL SECURITY;

-- No public policies - all access must go through edge functions
-- Edge functions use service_role which bypasses RLS

-- Create index on widget_id for faster lookups
CREATE INDEX idx_project_widget_id ON public.project(widget_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_project_updated_at
  BEFORE UPDATE ON public.project
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE public.project IS 'Stores widget configuration for each client project';
COMMENT ON COLUMN public.project.id IS 'Unique identifier for the project record';
COMMENT ON COLUMN public.project.widget_id IS 'Client-facing widget identifier used in embed code';
COMMENT ON COLUMN public.project.position IS 'Widget position on page (e.g., bottom-right, bottom-left)';
COMMENT ON COLUMN public.project.primary_color IS 'Primary brand color in hex format';
COMMENT ON COLUMN public.project.button_text IS 'Text displayed on the widget button';
COMMENT ON COLUMN public.project.greeting_message IS 'Initial greeting message shown to users';
COMMENT ON COLUMN public.project.api_endpoint IS 'Custom API endpoint for this project';
COMMENT ON COLUMN public.project.created_at IS 'Timestamp when the project was created';
COMMENT ON COLUMN public.project.updated_at IS 'Timestamp when the project was last updated';
