/*
# Add missing updated_by_user_id column to tables that have the ownership trigger

Three tables (automation_runs, knowledge_chunks, search_logs) have the
set_ownership trigger but are missing the updated_by_user_id column,
causing inserts to fail with "record new has no field updated_by_user_id".
*/

ALTER TABLE public.automation_runs ADD COLUMN IF NOT EXISTS updated_by_user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.knowledge_chunks ADD COLUMN IF NOT EXISTS updated_by_user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.search_logs ADD COLUMN IF NOT EXISTS updated_by_user_id uuid REFERENCES auth.users(id);

-- Restore the original trigger function since the v3 fix was a no-op
CREATE OR REPLACE FUNCTION public.set_ownership_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $_function$
BEGIN
  IF NEW.owner_user_id IS NULL THEN
    NEW.owner_user_id := auth.uid();
  END IF;
  IF NEW.created_by_user_id IS NULL THEN
    NEW.created_by_user_id := auth.uid();
  END IF;
  IF NEW.updated_by_user_id IS NULL THEN
    NEW.updated_by_user_id := auth.uid();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$_function$;
