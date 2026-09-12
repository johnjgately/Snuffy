/*
# Add Ownership Type and Organization ID to All Owned Tables

## Purpose
Every owned record now has an ownership_type ('personal', 'organization', 'shared')
and optional organization_id. This enables multi-tenant access control.

## Changes
- Add ownership_type text NOT NULL DEFAULT 'personal' to all owned tables
- Add organization_id uuid NULL (references organizations) to all owned tables
- Add CHECK constraint on ownership_type values
- Add index on organization_id for org-scoped queries
- Update set_ownership_on_insert trigger to set ownership_type default
- Add ownership transfer function

## Tables affected (15):
documents, document_folders, ai_connections, automations, automation_runs,
file_metadata, knowledge_bases, knowledge_chunks, knowledge_documents,
knowledge_settings, oauth_configs, role_permissions, search_logs,
search_settings, users
*/

DO $_$
DECLARE
  t text;
  tables text[] := ARRAY[
    'documents', 'document_folders', 'ai_connections', 'automations', 'automation_runs',
    'file_metadata', 'knowledge_bases', 'knowledge_chunks', 'knowledge_documents',
    'knowledge_settings', 'oauth_configs', 'role_permissions', 'search_logs',
    'search_settings', 'users'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS ownership_type text NOT NULL DEFAULT ''personal''', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_org ON public.%I(organization_id) WHERE organization_id IS NOT NULL', t, t);
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS chk_%I_ownership_type', t, t);
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT chk_%I_ownership_type CHECK (ownership_type IN (''personal'', ''organization'', ''shared''))', t, t);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping %: %', t, SQLERRM;
    END;
  END LOOP;
END;
$_$;

-- ============================================================
-- Update ownership trigger to handle new columns
-- ============================================================
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

-- ============================================================
-- Ownership transfer function
-- ============================================================
CREATE OR REPLACE FUNCTION public.transfer_record_ownership(
  p_table_name text,
  p_record_id uuid,
  p_new_owner_user_id uuid,
  p_new_ownership_type text DEFAULT 'personal',
  p_new_organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $_$
DECLARE
  v_old_owner uuid;
  v_old_org_id uuid;
  v_old_type text;
  v_query text;
BEGIN
  -- Validate ownership type
  IF p_new_ownership_type NOT IN ('personal', 'organization', 'shared') THEN
    RETURN false;
  END IF;

  -- Build safe dynamic query (table name validated against information_schema)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table_name
  ) THEN
    RETURN false;
  END IF;

  -- Get current ownership
  EXECUTE format(
    'SELECT owner_user_id, organization_id, ownership_type FROM public.%I WHERE id = $1',
    p_table_name
  ) INTO v_old_owner, v_old_org_id, v_old_type USING p_record_id;

  IF NOT FOUND THEN RETURN false; END IF;

  -- Check authorization: current owner or admin
  IF v_old_owner != auth.uid() AND NOT public.is_admin() THEN
    RETURN false;
  END IF;

  -- Perform transfer
  EXECUTE format(
    'UPDATE public.%I SET owner_user_id = $1, ownership_type = $2, organization_id = $3, updated_by_user_id = $4, updated_at = now() WHERE id = $5',
    p_table_name
  ) USING p_new_owner_user_id, p_new_ownership_type, p_new_organization_id, auth.uid(), p_record_id;

  -- Audit the transfer
  PERFORM public.log_audit(
    p_action := 'ownership.transfer',
    p_entity_type := p_table_name,
    p_entity_id := p_record_id,
    p_actor_user_id := auth.uid(),
    p_metadata := jsonb_build_object(
      'old_owner', v_old_owner,
      'new_owner', p_new_owner_user_id,
      'old_type', v_old_type,
      'new_type', p_new_ownership_type,
      'old_org', v_old_org_id,
      'new_org', p_new_organization_id
    )
  );

  RETURN true;
END;
$_$;

REVOKE EXECUTE ON FUNCTION public.transfer_record_ownership(text, uuid, uuid, text, uuid) FROM anon;
