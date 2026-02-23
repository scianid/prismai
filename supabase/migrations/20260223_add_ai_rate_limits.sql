-- H-2 fix: per-visitor and per-project rate limiting for AI endpoints.
--
-- Uses a 1-minute sliding window stored in a lightweight table.
-- The `increment_rate_limit` function performs an atomic INSERT … ON CONFLICT
-- DO UPDATE so there is no race condition between read and write.

CREATE TABLE IF NOT EXISTS public.ai_rate_limits (
  key           text        NOT NULL,
  window_start  timestamptz NOT NULL,
  request_count integer     NOT NULL DEFAULT 1,
  CONSTRAINT ai_rate_limits_pkey PRIMARY KEY (key, window_start)
);

-- Index for fast cleanup of old windows
CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_window
  ON public.ai_rate_limits (window_start);

-- Atomic increment: returns the updated request_count for the current window.
CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_key         text,
  p_window_start timestamptz
) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.ai_rate_limits (key, window_start, request_count)
  VALUES (p_key, p_window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET request_count = ai_rate_limits.request_count + 1
  RETURNING request_count INTO v_count;
  RETURN v_count;
END;
$$;

-- Cleanup function: delete windows older than 5 minutes.
-- Call periodically (e.g., from a scheduled Edge Function or pg_cron).
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits() RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM public.ai_rate_limits
  WHERE window_start < now() - INTERVAL '5 minutes';
$$;
