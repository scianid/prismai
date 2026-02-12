-- Drop old token usage table and all related objects
-- This removes the partitioned version and all its dependencies

-- Drop views first (depend on table)
DROP VIEW IF EXISTS public.token_usage_summary CASCADE;
DROP VIEW IF EXISTS public.token_usage_monthly CASCADE;
DROP VIEW IF EXISTS public.token_usage_daily CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS public.create_token_usage_partition(date) CASCADE;
DROP FUNCTION IF EXISTS public.ensure_token_usage_partition() CASCADE;
DROP FUNCTION IF EXISTS public.create_token_usage_partitions_ahead(integer) CASCADE;
DROP FUNCTION IF EXISTS public.drop_old_token_usage_partitions(integer) CASCADE;

-- Drop the main table (this will drop all partitions automatically since they're children)
DROP TABLE IF EXISTS public.token_usage CASCADE;

-- Clean up any orphaned partitions (just in case)
DO $$
DECLARE
  partition_record RECORD;
BEGIN
  FOR partition_record IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename LIKE 'token_usage_%'
      AND tablename ~ '^token_usage_\d{4}_\d{2}_\d{2}$'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', partition_record.tablename);
    RAISE NOTICE 'Dropped partition: %', partition_record.tablename;
  END LOOP;
END $$;
