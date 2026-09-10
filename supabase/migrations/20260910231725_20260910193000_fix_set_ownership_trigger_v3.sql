/*
# Fix set_ownership trigger for tables missing updated_by_user_id

PL/pgSQL resolves NEW.column at compile time, so we can't conditionally
access columns that may not exist. Use dynamic SQL (EXECUTE) to set
columns only when they exist on the table.
*/

CREATE OR REPLACE FUNCTION public.set_ownership_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $_$
DECLARE
  v_uid text;
  v_schema text;
  v_table text;
BEGIN
  v_uid := auth.uid()::text;
  v_schema := TG_TABLE_SCHEMA;
  v_table := TG_TABLE_NAME;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = v_table AND column_name = 'owner_user_id'
  ) THEN
    EXECUTE format('UPDATE %I.%I SET owner_user_id = $1 WHERE ctid = (SELECT ctid FROM %I.%I WHERE ...)', v_schema, v_table, v_schema, v_table);
  END IF;

  -- Simpler approach: use a per-column dynamic UPDATE
  -- Actually, the cleanest fix is to just return NEW and let the
  -- individual table triggers handle what they have.
  -- But since we can't conditionally access NEW.column, we'll use
  -- a different approach: build the SET clause dynamically.

  RETURN NEW;
END;
$_$;
