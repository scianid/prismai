-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.account (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  icon_url text,
  CONSTRAINT account_pkey PRIMARY KEY (id),
  CONSTRAINT account_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.analytics_events (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  project_id text NOT NULL,
  visitor_id uuid,
  session_id uuid,
  event_type text NOT NULL,
  event_label text,
  event_data jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT analytics_events_pkey PRIMARY KEY (id)
);
CREATE TABLE public.analytics_impressions (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  project_id text NOT NULL,
  visitor_id uuid,
  session_id uuid,
  url text,
  referrer text,
  user_agent text,
  geo_country text,
  geo_city text,
  geo_lat double precision,
  geo_lng double precision,
  created_at timestamp with time zone DEFAULT now(),
  ip text,
  platform text,
  CONSTRAINT analytics_impressions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.article (
  url text NOT NULL,
  title text NOT NULL,
  content text,
  cache jsonb,
  project_id text NOT NULL UNIQUE,
  unique_id text NOT NULL UNIQUE,
  CONSTRAINT article_pkey PRIMARY KEY (project_id)
);
CREATE TABLE public.project (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  direction USER-DEFINED NOT NULL,
  language text NOT NULL,
  icon_url text,
  client_name text NOT NULL,
  client_description text,
  highlight_color ARRAY,
  show_ad boolean NOT NULL,
  input_text_placeholders ARRAY NOT NULL,
  project_id text DEFAULT gen_random_uuid() UNIQUE,
  allowed_urls ARRAY,
  account_id uuid DEFAULT gen_random_uuid(),
  CONSTRAINT project_pkey PRIMARY KEY (id),
  CONSTRAINT project_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id)
);