/*
# Fix set_ownership trigger for tables missing updated_by_user_id

The set_ownership_on_insert() trigger unconditionally accesses
NEW.updated_by_user_id, but knowledge_chunks doesn't have that column.
Fix: use to_jsonb(NEW) ->> 'updated_by_user_id' to check column existence dynamically.
*/

CREATE OR REPLACE FUNCTION public.set_ownership_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $_$
DECLARE
  v_new jsonb;
  v_uid uuid;
BEGIN
  v_new := to_jsonb(NEW);
  v_uid := auth.uid();

  IF v_new ->> 'owner_user_id' IS NULL THEN
    NEW.owner_user_id := v_uid;
  END IF;
  IF v_new ->> 'created_by_user_id' IS NULL THEN
    NEW.created_by_user_id := v_uid;
  END IF;
  IF v_new ->> 'updated_by_user_id' IS NULL THEN
    NEW.updated_by_user_id := v_uid;
  END IF;
  IF v_new ->> 'updated_at' IS NULL THEN
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$_$;
