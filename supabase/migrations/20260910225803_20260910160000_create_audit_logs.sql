/*
# Immutable audit_logs table + log_audit() server-side function

1. audit_logs table:
   - id uuid PK
   - occurred_at timestamptz NOT NULL DEFAULT now()
   - actor_user_id uuid NULL (NULL only for system actions)
   - actor_display_name text NULL (snapshot at time of event)
   - action text NOT NULL (e.g. 'sign_in', 'record.create', 'document.upload')
   - entity_type text NULL (e.g. 'ai_connections', 'documents', 'users')
   - entity_id uuid NULL
   - record_owner_user_id uuid NULL (owner of the affected record)
   - file_path text NULL (storage path for document/file events)
   - outcome text NOT NULL DEFAULT 'success' CHECK (outcome IN ('success','denied','failed'))
   - request_id text NULL (correlation ID)
   - source_ip text NULL (only when available and permitted)
   - metadata jsonb NOT NULL DEFAULT '{}' (non-sensitive context)

2. Security:
   - RLS enabled: admin-only SELECT, no INSERT/UPDATE/DELETE from client.
   - Only the service role (edge functions) and the log_audit() function can INSERT.
   - No UPDATE or DELETE policy at all — records are immutable.

3. log_audit() function:
   - SECURITY DEFINER, callable by authenticated role.
   - Inserts a row with the provided details.
   - Sets actor_user_id from auth.uid() if not provided.
*/

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_display_name text,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  record_owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  file_path text,
  outcome text NOT NULL DEFAULT 'success' CHECK (outcome IN ('success','denied','failed')),
  request_id text,
  source_ip text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_logs FROM anon;

-- Admin-only SELECT
GRANT SELECT ON public.audit_logs TO authenticated;
CREATE POLICY "admin_select_audit_logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_roles ar WHERE ar.user_id = auth.uid() AND ar.role = 'admin'));

-- No INSERT/UPDATE/DELETE policies for authenticated — only service role can write.
-- The log_audit() function (SECURITY DEFINER) handles inserts from edge functions.

CREATE INDEX IF NOT EXISTS audit_logs_occurred_at_idx ON public.audit_logs (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON public.audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_outcome_idx ON public.audit_logs (outcome);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON public.audit_logs (action);

-- log_audit() function: callable by authenticated users (from edge functions with service role
-- or from RLS-evaluated contexts). Sets actor_user_id from auth.uid() when NULL.
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_outcome text DEFAULT 'success',
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_display_name text DEFAULT NULL,
  p_record_owner_user_id uuid DEFAULT NULL,
  p_file_path text DEFAULT NULL,
  p_request_id text DEFAULT NULL,
  p_source_ip text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_actor uuid;
BEGIN
  v_actor := COALESCE(p_actor_user_id, auth.uid());

  INSERT INTO public.audit_logs (
    action, entity_type, entity_id, outcome,
    actor_user_id, actor_display_name,
    record_owner_user_id, file_path,
    request_id, source_ip, metadata
  ) VALUES (
    p_action, p_entity_type, p_entity_id, p_outcome,
    v_actor, p_actor_display_name,
    p_record_owner_user_id, p_file_path,
    p_request_id, p_source_ip, p_metadata
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, text, uuid, text, uuid, text, text, text, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, text, uuid, text, uuid, text, text, text, jsonb) TO authenticated;
