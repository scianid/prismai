-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.article (
  url text NOT NULL UNIQUE,
  title text NOT NULL UNIQUE,
  content text,
  cache jsonb,
  project_id text
);

CREATE TABLE public.project (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  direction text NOT NULL,
  language text NOT NULL,
  icon_url text,
  client_name text NOT NULL,
  client_description text,
  highlight_color ARRAY,
  show_ad boolean NOT NULL,
  input_text_placeholders ARRAY NOT NULL,
  project_id text DEFAULT gen_random_uuid(),
  CONSTRAINT project_pkey PRIMARY KEY (id)
);