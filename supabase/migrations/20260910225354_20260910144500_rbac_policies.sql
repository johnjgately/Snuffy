/*
# Rewrite all RLS policies with RBAC

Replaces the previous owner-only policies with role-aware policies using
the can_read_record() and can_write_record() helper functions.

Roles:
- admin: full access to all records
- manager: read/write records owned by themselves or users they manage
- standard_user: read/write only their own records
- read_only: read only records explicitly shared with them (via record_shares)

For INSERT: owner_user_id must equal auth.uid() (admins excepted).
For UPDATE/DELETE: can_write_record() check against the existing row's owner_user_id.

System config tables (oauth_configs, search_settings, knowledge_settings, users,
role_permissions): admin-only access via can_write_record; read access for
authenticated users who own the record or via can_read_record.
*/

-- Drop all existing policies on user-content tables, then recreate with RBAC

-- ai_connections
DROP POLICY IF EXISTS "select_own_ai_connections" ON public.ai_connections;
DROP POLICY IF EXISTS "insert_own_ai_connections" ON public.ai_connections;
DROP POLICY IF EXISTS "update_own_ai_connections" ON public.ai_connections;
DROP POLICY IF EXISTS "delete_own_ai_connections" ON public.ai_connections;
CREATE POLICY "rbac_select_ai_connections" ON public.ai_connections
  FOR SELECT TO authenticated USING (public.can_read_record('ai_connections', owner_user_id));
CREATE POLICY "rbac_insert_ai_connections" ON public.ai_connections
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() OR public.is_admin());
CREATE POLICY "rbac_update_ai_connections" ON public.ai_connections
  FOR UPDATE TO authenticated
  USING (public.can_write_record('ai_connections', owner_user_id))
  WITH CHECK (public.can_write_record('ai_connections', owner_user_id));
CREATE POLICY "rbac_delete_ai_connections" ON public.ai_connections
  FOR DELETE TO authenticated
  USING (public.can_write_record('ai_connections', owner_user_id));

-- automations
DROP POLICY IF EXISTS "select_own_automations" ON public.automations;
DROP POLICY IF EXISTS "insert_own_automations" ON public.automations;
DROP POLICY IF EXISTS "update_own_automations" ON public.automations;
DROP POLICY IF EXISTS "delete_own_automations" ON public.automations;
CREATE POLICY "rbac_select_automations" ON public.automations
  FOR SELECT TO authenticated USING (public.can_read_record('automations', owner_user_id));
CREATE POLICY "rbac_insert_automations" ON public.automations
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() OR public.is_admin());
CREATE POLICY "rbac_update_automations" ON public.automations
  FOR UPDATE TO authenticated
  USING (public.can_write_record('automations', owner_user_id))
  WITH CHECK (public.can_write_record('automations', owner_user_id));
CREATE POLICY "rbac_delete_automations" ON public.automations
  FOR DELETE TO authenticated
  USING (public.can_write_record('automations', owner_user_id));

-- automation_runs
DROP POLICY IF EXISTS "select_own_automation_runs" ON public.automation_runs;
DROP POLICY IF EXISTS "insert_own_automation_runs" ON public.automation_runs;
DROP POLICY IF EXISTS "delete_own_automation_runs" ON public.automation_runs;
CREATE POLICY "rbac_select_automation_runs" ON public.automation_runs
  FOR SELECT TO authenticated USING (public.can_read_record('automation_runs', owner_user_id));
CREATE POLICY "rbac_insert_automation_runs" ON public.automation_runs
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() OR public.is_admin());
CREATE POLICY "rbac_delete_automation_runs" ON public.automation_runs
  FOR DELETE TO authenticated
  USING (public.can_write_record('automation_runs', owner_user_id));

-- documents
DROP POLICY IF EXISTS "select_own_documents" ON public.documents;
DROP POLICY IF EXISTS "insert_own_documents" ON public.documents;
DROP POLICY IF EXISTS "update_own_documents" ON public.documents;
DROP POLICY IF EXISTS "delete_own_documents" ON public.documents;
CREATE POLICY "rbac_select_documents" ON public.documents
  FOR SELECT TO authenticated USING (public.can_read_record('documents', owner_user_id));
CREATE POLICY "rbac_insert_documents" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() OR public.is_admin());
CREATE POLICY "rbac_update_documents" ON public.documents
  FOR UPDATE TO authenticated
  USING (public.can_write_record('documents', owner_user_id))
  WITH CHECK (public.can_write_record('documents', owner_user_id));
CREATE POLICY "rbac_delete_documents" ON public.documents
  FOR DELETE TO authenticated
  USING (public.can_write_record('documents', owner_user_id));

-- document_folders
DROP POLICY IF EXISTS "select_own_document_folders" ON public.document_folders;
DROP POLICY IF EXISTS "insert_own_document_folders" ON public.document_folders;
DROP POLICY IF EXISTS "update_own_document_folders" ON public.document_folders;
DROP POLICY IF EXISTS "delete_own_document_folders" ON public.document_folders;
CREATE POLICY "rbac_select_document_folders" ON public.document_folders
  FOR SELECT TO authenticated USING (public.can_read_record('document_folders', owner_user_id));
CREATE POLICY "rbac_insert_document_folders" ON public.document_folders
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() OR public.is_admin());
CREATE POLICY "rbac_update_document_folders" ON public.document_folders
  FOR UPDATE TO authenticated
  USING (public.can_write_record('document_folders', owner_user_id))
  WITH CHECK (public.can_write_record('document_folders', owner_user_id));
CREATE POLICY "rbac_delete_document_folders" ON public.document_folders
  FOR DELETE TO authenticated
  USING (public.can_write_record('document_folders', owner_user_id));

-- knowledge_bases
DROP POLICY IF EXISTS "select_own_knowledge_bases" ON public.knowledge_bases;
DROP POLICY IF EXISTS "insert_own_knowledge_bases" ON public.knowledge_bases;
DROP POLICY IF EXISTS "update_own_knowledge_bases" ON public.knowledge_bases;
DROP POLICY IF EXISTS "delete_own_knowledge_bases" ON public.knowledge_bases;
CREATE POLICY "rbac_select_knowledge_bases" ON public.knowledge_bases
  FOR SELECT TO authenticated USING (public.can_read_record('knowledge_bases', owner_user_id));
CREATE POLICY "rbac_insert_knowledge_bases" ON public.knowledge_bases
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() OR public.is_admin());
CREATE POLICY "rbac_update_knowledge_bases" ON public.knowledge_bases
  FOR UPDATE TO authenticated
  USING (public.can_write_record('knowledge_bases', owner_user_id))
  WITH CHECK (public.can_write_record('knowledge_bases', owner_user_id));
CREATE POLICY "rbac_delete_knowledge_bases" ON public.knowledge_bases
  FOR DELETE TO authenticated
  USING (public.can_write_record('knowledge_bases', owner_user_id));

-- knowledge_documents
DROP POLICY IF EXISTS "select_own_knowledge_documents" ON public.knowledge_documents;
DROP POLICY IF EXISTS "insert_own_knowledge_documents" ON public.knowledge_documents;
DROP POLICY IF EXISTS "update_own_knowledge_documents" ON public.knowledge_documents;
DROP POLICY IF EXISTS "delete_own_knowledge_documents" ON public.knowledge_documents;
CREATE POLICY "rbac_select_knowledge_documents" ON public.knowledge_documents
  FOR SELECT TO authenticated USING (public.can_read_record('knowledge_documents', owner_user_id));
CREATE POLICY "rbac_insert_knowledge_documents" ON public.knowledge_documents
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() OR public.is_admin());
CREATE POLICY "rbac_update_knowledge_documents" ON public.knowledge_documents
  FOR UPDATE TO authenticated
  USING (public.can_write_record('knowledge_documents', owner_user_id))
  WITH CHECK (public.can_write_record('knowledge_documents', owner_user_id));
CREATE POLICY "rbac_delete_knowledge_documents" ON public.knowledge_documents
  FOR DELETE TO authenticated
  USING (public.can_write_record('knowledge_documents', owner_user_id));

-- knowledge_chunks
DROP POLICY IF EXISTS "select_own_knowledge_chunks" ON public.knowledge_chunks;
DROP POLICY IF EXISTS "insert_own_knowledge_chunks" ON public.knowledge_chunks;
DROP POLICY IF EXISTS "update_own_knowledge_chunks" ON public.knowledge_chunks;
DROP POLICY IF EXISTS "delete_own_knowledge_chunks" ON public.knowledge_chunks;
CREATE POLICY "rbac_select_knowledge_chunks" ON public.knowledge_chunks
  FOR SELECT TO authenticated USING (public.can_read_record('knowledge_chunks', owner_user_id));
CREATE POLICY "rbac_insert_knowledge_chunks" ON public.knowledge_chunks
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() OR public.is_admin());
CREATE POLICY "rbac_update_knowledge_chunks" ON public.knowledge_chunks
  FOR UPDATE TO authenticated
  USING (public.can_write_record('knowledge_chunks', owner_user_id))
  WITH CHECK (public.can_write_record('knowledge_chunks', owner_user_id));
CREATE POLICY "rbac_delete_knowledge_chunks" ON public.knowledge_chunks
  FOR DELETE TO authenticated
  USING (public.can_write_record('knowledge_chunks', owner_user_id));

-- search_logs
DROP POLICY IF EXISTS "select_own_search_logs" ON public.search_logs;
DROP POLICY IF EXISTS "insert_own_search_logs" ON public.search_logs;
DROP POLICY IF EXISTS "delete_own_search_logs" ON public.search_logs;
CREATE POLICY "rbac_select_search_logs" ON public.search_logs
  FOR SELECT TO authenticated USING (public.can_read_record('search_logs', owner_user_id));
CREATE POLICY "rbac_insert_search_logs" ON public.search_logs
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() OR public.is_admin());
CREATE POLICY "rbac_delete_search_logs" ON public.search_logs
  FOR DELETE TO authenticated
  USING (public.can_write_record('search_logs', owner_user_id));

-- System config tables: admin-only writes, admin reads all, others read own
-- oauth_configs
DROP POLICY IF EXISTS "anon_select_oauth_configs" ON public.oauth_configs;
DROP POLICY IF EXISTS "anon_insert_oauth_configs" ON public.oauth_configs;
DROP POLICY IF EXISTS "anon_update_oauth_configs" ON public.oauth_configs;
DROP POLICY IF EXISTS "anon_delete_oauth_configs" ON public.oauth_configs;
CREATE POLICY "rbac_select_oauth_configs" ON public.oauth_configs
  FOR SELECT TO authenticated USING (public.can_read_record('oauth_configs', owner_user_id));
CREATE POLICY "rbac_insert_oauth_configs" ON public.oauth_configs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY "rbac_update_oauth_configs" ON public.oauth_configs
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
CREATE POLICY "rbac_delete_oauth_configs" ON public.oauth_configs
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- search_settings
DROP POLICY IF EXISTS "anon_select_search_settings" ON public.search_settings;
DROP POLICY IF EXISTS "anon_insert_search_settings" ON public.search_settings;
DROP POLICY IF EXISTS "anon_update_search_settings" ON public.search_settings;
DROP POLICY IF EXISTS "anon_delete_search_settings" ON public.search_settings;
CREATE POLICY "rbac_select_search_settings" ON public.search_settings
  FOR SELECT TO authenticated USING (public.can_read_record('search_settings', owner_user_id));
CREATE POLICY "rbac_insert_search_settings" ON public.search_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY "rbac_update_search_settings" ON public.search_settings
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
CREATE POLICY "rbac_delete_search_settings" ON public.search_settings
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- knowledge_settings
DROP POLICY IF EXISTS "anon_select_knowledge_settings" ON public.knowledge_settings;
DROP POLICY IF EXISTS "anon_insert_knowledge_settings" ON public.knowledge_settings;
DROP POLICY IF EXISTS "anon_update_knowledge_settings" ON public.knowledge_settings;
DROP POLICY IF EXISTS "anon_delete_knowledge_settings" ON public.knowledge_settings;
CREATE POLICY "rbac_select_knowledge_settings" ON public.knowledge_settings
  FOR SELECT TO authenticated USING (public.can_read_record('knowledge_settings', owner_user_id));
CREATE POLICY "rbac_insert_knowledge_settings" ON public.knowledge_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY "rbac_update_knowledge_settings" ON public.knowledge_settings
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
CREATE POLICY "rbac_delete_knowledge_settings" ON public.knowledge_settings
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- users (custom directory): admin-only writes, admin reads all, others read own
DROP POLICY IF EXISTS "anon_select_users" ON public.users;
DROP POLICY IF EXISTS "anon_insert_users" ON public.users;
DROP POLICY IF EXISTS "anon_update_users" ON public.users;
DROP POLICY IF EXISTS "anon_delete_users" ON public.users;
CREATE POLICY "rbac_select_users" ON public.users
  FOR SELECT TO authenticated USING (public.can_read_record('users', owner_user_id));
CREATE POLICY "rbac_insert_users" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY "rbac_update_users" ON public.users
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
CREATE POLICY "rbac_delete_users" ON public.users
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- role_permissions: admin-only writes, all authenticated can read
DROP POLICY IF EXISTS "read_role_permissions" ON public.role_permissions;
CREATE POLICY "rbac_select_role_permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "rbac_insert_role_permissions" ON public.role_permissions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY "rbac_update_role_permissions" ON public.role_permissions
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
CREATE POLICY "rbac_delete_role_permissions" ON public.role_permissions
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- Grant necessary privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_connections, public.automations, public.automation_runs, public.documents, public.document_folders, public.knowledge_bases, public.knowledge_documents, public.knowledge_chunks, public.search_logs TO authenticated;
GRANT SELECT ON public.oauth_configs, public.search_settings, public.knowledge_settings, public.users, public.role_permissions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.users, public.role_permissions, public.oauth_configs, public.search_settings, public.knowledge_settings TO authenticated;
