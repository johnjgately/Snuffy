/*
# RBAC infrastructure: roles, manager relationships, record sharing, helper functions

1. New tables
- `app_roles`: maps each authenticated Supabase user to one of admin, manager, standard_user, read_only.
- `manager_relationships`: records which users a manager can administer (explicit, many-to-many).
- `record_shares`: explicit per-record read grants for read_only users (or anyone).

2. Helper functions (SECURITY DEFINER, search_path safe)
- `app_role(uid uuid)`: returns the user's role or NULL.
- `is_admin()`: true if the current user is an admin.
- `is_manager_of(target uuid)`: true if the current user manages the target user.
- `can_read_record(table_name text, record_owner uuid)`: admin sees all; manager sees records owned by their reports; standard_user sees own; read_only sees records explicitly shared with them.
- `can_write_record(table_name text, record_owner uuid)`: admin writes all; manager writes records owned by their reports; standard_user writes own; read_only never.
- `current_user_id()`: convenience wrapper around auth.uid().

3. Security
- All tables have RLS enabled.
- `app_roles` is readable by the user themselves and by admins; only admins can insert/update/delete.
- `manager_relationships` is readable by the manager, the managed user, and admins; only admins can modify.
- `record_shares` is readable by the share recipient, the record owner, and admins; only the owner and admins can create/update/delete shares.
*/

CREATE TABLE IF NOT EXISTS public.app_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'standard_user'
    CHECK (role IN ('admin', 'manager', 'standard_user', 'read_only')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_roles FROM anon;
GRANT SELECT ON public.app_roles TO authenticated;
CREATE POLICY "select_own_or_admin_app_roles" ON public.app_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.app_roles ar WHERE ar.user_id = auth.uid() AND ar.role = 'admin'));
CREATE POLICY "admin_manage_app_roles" ON public.app_roles
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_roles ar WHERE ar.user_id = auth.uid() AND ar.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_roles ar WHERE ar.user_id = auth.uid() AND ar.role = 'admin'));

CREATE TABLE IF NOT EXISTS public.manager_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  managed_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manager_id, managed_id),
  CHECK (manager_id <> managed_id)
);
ALTER TABLE public.manager_relationships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manager_relationships FROM anon;
GRANT SELECT ON public.manager_relationships TO authenticated;
CREATE POLICY "select_related_manager_rels" ON public.manager_relationships
  FOR SELECT TO authenticated
  USING (
    manager_id = auth.uid() OR
    managed_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.app_roles ar WHERE ar.user_id = auth.uid() AND ar.role = 'admin')
  );
CREATE POLICY "admin_manage_manager_rels" ON public.manager_relationships
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_roles ar WHERE ar.user_id = auth.uid() AND ar.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_roles ar WHERE ar.user_id = auth.uid() AND ar.role = 'admin'));

CREATE TABLE IF NOT EXISTS public.record_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  shared_with_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_name, record_id, shared_with_user_id)
);
ALTER TABLE public.record_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.record_shares FROM anon;
GRANT SELECT ON public.record_shares TO authenticated;
CREATE POLICY "select_own_or_shared_record_shares" ON public.record_shares
  FOR SELECT TO authenticated
  USING (
    shared_with_user_id = auth.uid() OR
    shared_by_user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.app_roles ar WHERE ar.user_id = auth.uid() AND ar.role = 'admin')
  );
CREATE POLICY "insert_own_record_shares" ON public.record_shares
  FOR INSERT TO authenticated
  WITH CHECK (shared_by_user_id = auth.uid());
CREATE POLICY "delete_own_record_shares" ON public.record_shares
  FOR DELETE TO authenticated
  USING (shared_by_user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.app_roles ar WHERE ar.user_id = auth.uid() AND ar.role = 'admin'));

CREATE INDEX IF NOT EXISTS manager_relationships_managed_idx ON public.manager_relationships (managed_id);
CREATE INDEX IF NOT EXISTS manager_relationships_manager_idx ON public.manager_relationships (manager_id);
CREATE INDEX IF NOT EXISTS record_shares_lookup_idx ON public.record_shares (table_name, record_id, shared_with_user_id);

-- Helper functions
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT auth.uid(); $$;

CREATE OR REPLACE FUNCTION public.app_role(p_user_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ar.role
  FROM public.app_roles ar
  WHERE ar.user_id = COALESCE(p_user_id, auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.app_role() = 'admin'; $$;

CREATE OR REPLACE FUNCTION public.is_manager_of(p_target_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.manager_relationships mr
    WHERE mr.manager_id = auth.uid() AND mr.managed_id = p_target_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_record(p_table_name text, p_record_owner uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := public.app_role();
  IF v_role = 'admin' THEN
    RETURN true;
  ELSIF v_role = 'manager' THEN
    RETURN p_record_owner = auth.uid() OR public.is_manager_of(p_record_owner);
  ELSIF v_role = 'standard_user' THEN
    RETURN p_record_owner = auth.uid();
  ELSIF v_role = 'read_only' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.record_shares rs
      WHERE rs.table_name = p_table_name
        AND rs.shared_with_user_id = auth.uid()
    ) OR p_record_owner = auth.uid();
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_write_record(p_table_name text, p_record_owner uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := public.app_role();
  IF v_role = 'admin' THEN
    RETURN true;
  ELSIF v_role = 'manager' THEN
    RETURN p_record_owner = auth.uid() OR public.is_manager_of(p_record_owner);
  ELSIF v_role = 'standard_user' THEN
    RETURN p_record_owner = auth.uid();
  END IF;
  RETURN false;
END;
$$;

-- Auto-update updated_at on app_roles
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_roles_set_updated_at ON public.app_roles;
CREATE TRIGGER app_roles_set_updated_at BEFORE UPDATE ON public.app_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
