/*
# Fix set_ownership trigger for tables missing updated_by_user_id

The trigger tries to set NEW.updated_by_user_id which doesn't exist on
knowledge_chunks. Use a conditional approach with attribute checking.
*/

CREATE OR REPLACE FUNCTION public.set_ownership_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $_$
DECLARE
  v_uid uuid;
  v_has_owner boolean;
  v_has_created_by boolean;
  v_has_updated_by boolean;
  v_has_updated_at boolean;
BEGIN
  v_uid := auth.uid();

  v_has_owner := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = TG_TABLE_SCHEMA AND table_name = TG_TABLE_NAME AND column_name = 'owner_user_id'
  );
  v_has_created_by := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = TG_TABLE_SCHEMA AND table_name = TG_TABLE_NAME AND column_name = 'created_by_user_id'
  );
  v_has_updated_by := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = TG_TABLE_SCHEMA AND table_name = TG_TABLE_NAME AND column_name = 'updated_by_user_id'
  );
  v_has_updated_at := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = TG_TABLE_SCHEMA AND table_name = TG_TABLE_NAME AND column_name = 'updated_at'
  );

  IF v_has_owner AND NEW.owner_user_id IS NULL THEN
    NEW.owner_user_id := v_uid;
  END IF;
  IF v_has_created_by AND NEW.created_by_user_id IS NULL THEN
    NEW.created_by_user_id := v_uid;
  END IF;
  IF v_has_updated_by AND NEW.updated_by_user_id IS NULL THEN
    NEW.updated_by_user_id := v_uid;
  END IF;
  IF v_has_updated_at AND NEW.updated_at IS NULL THEN
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$_$;
