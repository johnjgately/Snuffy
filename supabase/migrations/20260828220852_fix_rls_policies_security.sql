-- =====================================================
-- Fix RLS: Replace open `true` policies with proper auth
-- =====================================================

-- 1. ai_connections (contains API keys - CRITICAL)
DROP POLICY IF EXISTS "anon_delete_ai_connections" ON ai_connections;
DROP POLICY IF EXISTS "anon_insert_ai_connections" ON ai_connections;
DROP POLICY IF EXISTS "anon_select_ai_connections" ON ai_connections;
DROP POLICY IF EXISTS "anon_update_ai_connections" ON ai_connections;

CREATE POLICY "select_ai_connections" ON ai_connections
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_ai_connections" ON ai_connections
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_ai_connections" ON ai_connections
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_ai_connections" ON ai_connections
  FOR DELETE TO authenticated USING (true);

-- 2. automations
DROP POLICY IF EXISTS "anon_delete_automations" ON automations;
DROP POLICY IF EXISTS "anon_insert_automations" ON automations;
DROP POLICY IF EXISTS "anon_select_automations" ON automations;
DROP POLICY IF EXISTS "anon_update_automations" ON automations;

CREATE POLICY "select_automations" ON automations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_automations" ON automations
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_automations" ON automations
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_automations" ON automations
  FOR DELETE TO authenticated USING (true);

-- 3. knowledge_bases
DROP POLICY IF EXISTS "anon_delete_knowledge_bases" ON knowledge_bases;
DROP POLICY IF EXISTS "anon_insert_knowledge_bases" ON knowledge_bases;
DROP POLICY IF EXISTS "anon_select_knowledge_bases" ON knowledge_bases;
DROP POLICY IF EXISTS "anon_update_knowledge_bases" ON knowledge_bases;

CREATE POLICY "select_knowledge_bases" ON knowledge_bases
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_knowledge_bases" ON knowledge_bases
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_knowledge_bases" ON knowledge_bases
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_knowledge_bases" ON knowledge_bases
  FOR DELETE TO authenticated USING (true);

-- 4. knowledge_chunks
DROP POLICY IF EXISTS "anon_delete_knowledge_chunks" ON knowledge_chunks;
DROP POLICY IF EXISTS "anon_insert_knowledge_chunks" ON knowledge_chunks;
DROP POLICY IF EXISTS "anon_select_knowledge_chunks" ON knowledge_chunks;
DROP POLICY IF EXISTS "anon_update_knowledge_chunks" ON knowledge_chunks;

CREATE POLICY "select_knowledge_chunks" ON knowledge_chunks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_knowledge_chunks" ON knowledge_chunks
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_knowledge_chunks" ON knowledge_chunks
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_knowledge_chunks" ON knowledge_chunks
  FOR DELETE TO authenticated USING (true);

-- 5. knowledge_documents
DROP POLICY IF EXISTS "anon_delete_knowledge_documents" ON knowledge_documents;
DROP POLICY IF EXISTS "anon_insert_knowledge_documents" ON knowledge_documents;
DROP POLICY IF EXISTS "anon_select_knowledge_documents" ON knowledge_documents;
DROP POLICY IF EXISTS "anon_update_knowledge_documents" ON knowledge_documents;

CREATE POLICY "select_knowledge_documents" ON knowledge_documents
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_knowledge_documents" ON knowledge_documents
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_knowledge_documents" ON knowledge_documents
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_knowledge_documents" ON knowledge_documents
  FOR DELETE TO authenticated USING (true);

-- 6. knowledge_settings
DROP POLICY IF EXISTS "anon_delete_knowledge_settings" ON knowledge_settings;
DROP POLICY IF EXISTS "anon_insert_knowledge_settings" ON knowledge_settings;
DROP POLICY IF EXISTS "anon_select_knowledge_settings" ON knowledge_settings;
DROP POLICY IF EXISTS "anon_update_knowledge_settings" ON knowledge_settings;

CREATE POLICY "select_knowledge_settings" ON knowledge_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_knowledge_settings" ON knowledge_settings
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_knowledge_settings" ON knowledge_settings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_knowledge_settings" ON knowledge_settings
  FOR DELETE TO authenticated USING (true);

-- 7. oauth_configs (contains client secrets - CRITICAL)
DROP POLICY IF EXISTS "anon_delete_oauth_configs" ON oauth_configs;
DROP POLICY IF EXISTS "anon_insert_oauth_configs" ON oauth_configs;
DROP POLICY IF EXISTS "anon_select_oauth_configs" ON oauth_configs;
DROP POLICY IF EXISTS "anon_update_oauth_configs" ON oauth_configs;

CREATE POLICY "select_oauth_configs" ON oauth_configs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_oauth_configs" ON oauth_configs
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_oauth_configs" ON oauth_configs
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_oauth_configs" ON oauth_configs
  FOR DELETE TO authenticated USING (true);

-- 8. search_settings
DROP POLICY IF EXISTS "anon_delete_search_settings" ON search_settings;
DROP POLICY IF EXISTS "anon_insert_search_settings" ON search_settings;
DROP POLICY IF EXISTS "anon_select_search_settings" ON search_settings;
DROP POLICY IF EXISTS "anon_update_search_settings" ON search_settings;

CREATE POLICY "select_search_settings" ON search_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_search_settings" ON search_settings
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_search_settings" ON search_settings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_search_settings" ON search_settings
  FOR DELETE TO authenticated USING (true);

-- 9. users (contains emails - CRITICAL)
DROP POLICY IF EXISTS "anon_delete_users" ON users;
DROP POLICY IF EXISTS "anon_insert_users" ON users;
DROP POLICY IF EXISTS "anon_select_users" ON users;
DROP POLICY IF EXISTS "anon_update_users" ON users;

CREATE POLICY "select_users" ON users
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_users" ON users
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_users" ON users
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_users" ON users
  FOR DELETE TO authenticated USING (true);

-- 10. search_logs - already authenticated-only for SELECT/DELETE, but INSERT was anon+authenticated
DROP POLICY IF EXISTS "anon_insert_search_logs" ON search_logs;
DROP POLICY IF EXISTS "authed_select_search_logs" ON search_logs;
DROP POLICY IF EXISTS "authed_delete_search_logs" ON search_logs;

CREATE POLICY "select_search_logs" ON search_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_search_logs" ON search_logs
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "delete_search_logs" ON search_logs
  FOR DELETE TO authenticated USING (true);

-- 11. role_permissions - already authenticated but with `true` qual, keep as-is (shared config)
-- No change needed - these are shared organizational config rows

-- 12. automation_runs - already authenticated, keep as-is
-- No change needed

-- =====================================================
-- Fix SECURITY DEFINER function: revoke anon/public EXECUTE
-- =====================================================
REVOKE EXECUTE ON FUNCTION public.increment_ai_usage(uuid, integer) FROM PUBLIC, anon;
