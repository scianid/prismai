-- Backfill token_usage rows that are missing model and/or cost_usd.
-- Adds cost_usd column if it doesn't exist, then fills nulls.
--
-- Pricing (gpt-5.2): $1.75 / 1M input tokens, $14.00 / 1M output tokens

ALTER TABLE public.token_usage
  ADD COLUMN IF NOT EXISTS cost_usd numeric(12, 8);

-- Set model on rows where it is NULL
UPDATE public.token_usage
SET model = 'gpt-5.2'
WHERE model IS NULL;

-- Compute cost_usd on rows where it is NULL
UPDATE public.token_usage
SET cost_usd = (input_tokens  / 1000000.0 * 1.75)
             + (output_tokens / 1000000.0 * 14.00)
WHERE cost_usd IS NULL;

COMMENT ON COLUMN public.token_usage.cost_usd IS 'Estimated USD cost for this request based on model pricing';
