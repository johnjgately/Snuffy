/*
# Security Hardening Migration

## Issues fixed:
1. Revoke anon grants on protected tables
2. Fix weak WITH CHECK on UPDATE policies
3. Add RLS policies for oauth_states
4. Revoke EXECUTE on helper/trigger SECURITY DEFINER functions from anon
5. Fix FOR ALL policies to per-verb policies
*/

-- 1. Revoke anon grants on protected tables
REVOKE ALL ON public.documents FROM anon;
REVOKE ALL ON public.document_folders FROM anon;
REVOKE ALL ON public.file_access_log FROM anon;
REVOKE ALL ON public.file_metadata FROM anon;
REVOKE ALL ON public.role_permissions FROM anon;
REVOKE ALL ON public.storage_settings FROM anon;

-- 2. Fix weak WITH CHECK on UPDATE policies
DROP POLICY IF EXISTS update_knowledge_bases ON public.knowledge_bases;
CREATE POLICY "update_knowledge_bases" ON public.knowledge_bases
  FOR UPDATE TO authenticated
  USING (can_write_record('knowledge_bases'::text, owner_user_id))
  WITH CHECK (can_write_record('knowledge_bases'::text, owner_user_id));

DROP POLICY IF EXISTS update_knowledge_chunks ON public.knowledge_chunks;
CREATE POLICY "update_knowledge_chunks" ON public.knowledge_chunks
  FOR UPDATE TO authenticated
  USING (can_write_record('knowledge_chunks'::text, owner_user_id))
  WITH CHECK (can_write_record('knowledge_chunks'::text, owner_user_id));

DROP POLICY IF EXISTS update_knowledge_documents ON public.knowledge_documents;
CREATE POLICY "update_knowledge_documents" ON public.knowledge_documents
  FOR UPDATE TO authenticated
  USING (can_write_record('knowledge_documents'::text, owner_user_id))
  WITH CHECK (can_write_record('knowledge_documents'::text, owner_user_id));

DROP POLICY IF EXISTS update_knowledge_settings ON public.knowledge_settings;
CREATE POLICY "update_knowledge_settings" ON public.knowledge_settings
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS update_oauth_configs ON public.oauth_configs;
CREATE POLICY "update_oauth_configs" ON public.oauth_configs
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS update_search_settings ON public.search_settings;
CREATE POLICY "update_search_settings" ON public.search_settings
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS update_users ON public.users;
CREATE POLICY "update_users" ON public.users
  FOR UPDATE TO authenticated
  USING (can_write_record('users'::text, owner_user_id))
  WITH CHECK (can_write_record('users'::text, owner_user_id));

-- 3. Add RLS policies for oauth_states
CREATE POLICY "select_own_oauth_states" ON public.oauth_states
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "insert_own_oauth_states" ON public.oauth_states
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "delete_own_oauth_states" ON public.oauth_states
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 4. Revoke EXECUTE on helper/trigger functions from PUBLIC
REVOKE EXECUTE ON FUNCTION public.audit_trigger_fn() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_ownership_on_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_updated_by_on_update() FROM PUBLIC;

-- Restrict RPC-callable functions to authenticated only
REVOKE EXECUTE ON FUNCTION public.app_role(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_manager_of(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_read_record(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_write_record(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, text, uuid, text, uuid, text, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rag_health_check() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rag_search(public.vector, integer, uuid, uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_file_access(uuid, text, text, jsonb) FROM anon;

-- 5. Fix FOR ALL policies to per-verb policies
-- app_roles
DROP POLICY IF EXISTS admin_manage_app_roles ON public.app_roles;
DROP POLICY IF EXISTS select_own_or_admin_app_roles ON public.app_roles;

CREATE POLICY "select_own_or_admin_app_roles_v2" ON public.app_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "admin_insert_app_roles" ON public.app_roles
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "admin_update_app_roles" ON public.app_roles
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "admin_delete_app_roles" ON public.app_roles
  FOR DELETE TO authenticated
  USING (is_admin());

-- manager_relationships (columns: manager_id, managed_id)
DROP POLICY IF EXISTS admin_manage_manager_rels ON public.manager_relationships;

CREATE POLICY "admin_select_manager_rels" ON public.manager_relationships
  FOR SELECT TO authenticated
  USING (is_admin() OR manager_id = auth.uid() OR managed_id = auth.uid());

CREATE POLICY "admin_insert_manager_rels" ON public.manager_relationships
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "admin_update_manager_rels" ON public.manager_relationships
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "admin_delete_manager_rels" ON public.manager_relationships
  FOR DELETE TO authenticated
  USING (is_admin());
