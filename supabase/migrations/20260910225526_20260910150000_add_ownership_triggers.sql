/*
# Add auto-ownership triggers

When a client inserts a row without specifying owner_user_id, these triggers
set it to auth.uid() automatically. This ensures the RLS WITH CHECK
(owner_user_id = auth.uid()) passes without requiring every client insert to
explicitly include the field.

Also sets created_by_user_id and updated_by_user_id on insert.
*/

CREATE OR REPLACE FUNCTION public.set_ownership_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.set_updated_by_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_by_user_id := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'ai_connections', 'automations', 'automation_runs', 'documents',
    'document_folders', 'knowledge_bases', 'knowledge_documents',
    'knowledge_chunks', 'search_logs', 'oauth_configs', 'search_settings',
    'knowledge_settings', 'users', 'role_permissions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('DROP TRIGGER IF EXISTS %I_set_ownership ON public.%I;', t, t);
      EXECUTE format('CREATE TRIGGER %I_set_ownership BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_ownership_on_insert();', t, t);
      EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_by ON public.%I;', t, t);
      EXECUTE format('CREATE TRIGGER %I_set_updated_by BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_by_on_update();', t, t);
    EXCEPTION WHEN others THEN NULL; END;
  END LOOP;
END $$;
