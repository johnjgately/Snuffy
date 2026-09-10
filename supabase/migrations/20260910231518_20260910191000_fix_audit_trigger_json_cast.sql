CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $_$
DECLARE
  v_action text;
  v_entity_id uuid;
  v_owner uuid;
  v_actor uuid;
  v_new_json jsonb;
  v_old_json jsonb;
  v_id_val text;
  v_owner_val text;
BEGIN
  v_actor := auth.uid();
  v_new_json := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  v_old_json := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE '{}'::jsonb END;

  IF TG_OP = 'INSERT' THEN
    v_action := TG_TABLE_NAME || '.create';
    v_id_val := v_new_json ->> 'id';
    v_owner_val := v_new_json ->> 'owner_user_id';
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := TG_TABLE_NAME || '.update';
    v_id_val := v_new_json ->> 'id';
    v_owner_val := v_new_json ->> 'owner_user_id';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := TG_TABLE_NAME || '.delete';
    v_id_val := v_old_json ->> 'id';
    v_owner_val := v_old_json ->> 'owner_user_id';
  END IF;

  v_entity_id := CASE WHEN v_id_val IS NOT NULL THEN v_id_val::uuid ELSE NULL END;
  v_owner := CASE WHEN v_owner_val IS NOT NULL THEN v_owner_val::uuid ELSE NULL END;

  IF v_actor IS NOT NULL OR v_owner IS NOT NULL THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, outcome, actor_user_id, record_owner_user_id, metadata)
    VALUES (v_action, TG_TABLE_NAME, v_entity_id, 'success', v_actor, v_owner, jsonb_build_object('op', TG_OP));
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$_$;
