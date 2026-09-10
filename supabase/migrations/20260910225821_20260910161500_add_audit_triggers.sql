/*
# Database triggers for automatic audit logging on key tables

Creates a generic trigger function that logs INSERT/UPDATE/DELETE events
to audit_logs, then attaches it to each user-content table.

The trigger captures:
- action: '<table>.create' | '<table>.update' | '<table>.delete'
- entity_type: table name
- entity_id: the row's PK (must be named 'id')
- actor_user_id: from auth.uid() (set by the trigger via current_setting or auth context)
- record_owner_user_id: from the row's owner_user_id
- outcome: 'success'

Note: auth.uid() is available inside triggers when the DML originates from an
authenticated session. For service-role inserts (edge functions), auth.uid() is NULL,
so actor_user_id will be NULL — the edge function is responsible for calling log_audit()
explicitly with the correct actor.
*/

CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_entity_id uuid;
  v_owner uuid;
  v_actor uuid;
BEGIN
  v_actor := auth.uid();

  IF TG_OP = 'INSERT' THEN
    v_action := TG_TABLE_NAME || '.create';
    v_entity_id := NEW.id;
    v_owner := NEW.owner_user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := TG_TABLE_NAME || '.update';
    v_entity_id := NEW.id;
    v_owner := NEW.owner_user_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := TG_TABLE_NAME || '.delete';
    v_entity_id := OLD.id;
    v_owner := OLD.owner_user_id;
  END IF;

  -- Only log if there's an actor (authenticated session) or an owner
  IF v_actor IS NOT NULL OR v_owner IS NOT NULL THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, outcome, actor_user_id, record_owner_user_id, metadata)
    VALUES (v_action, TG_TABLE_NAME, v_entity_id, 'success', v_actor, v_owner, jsonb_build_object('op', TG_OP));
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_trigger_fn() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.audit_trigger_fn() TO authenticated;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'ai_connections', 'automations', 'automation_runs', 'documents',
    'document_folders', 'knowledge_bases', 'knowledge_documents',
    'knowledge_chunks', 'search_logs', 'users', 'role_permissions',
    'app_roles', 'manager_relationships', 'oauth_configs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('DROP TRIGGER IF EXISTS %I_audit_trigger ON public.%I;', t, t);
      EXECUTE format('CREATE TRIGGER %I_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();', t, t);
    EXCEPTION WHEN others THEN NULL; END;
  END LOOP;
END $$;
