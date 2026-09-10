/*
# Harden authenticated data access and private storage

1. Purpose
- Replace broad authenticated `USING (true)` policies on sensitive application data with owner-scoped policies.
- Keep existing rows safe by preserving them in place; rows that do not yet have an owner are not exposed by the new policies.

2. Modified tables
- `ai_connections`: add nullable `user_id` with an authenticated-session default; restrict rows to their owner; hide `api_key` from browser roles.
- `automations`: add nullable `user_id` with an authenticated-session default; restrict rows to their owner.
- `automation_runs`: add nullable `user_id` with an authenticated-session default; restrict rows to their owner.
- `knowledge_bases`: add nullable `user_id` with an authenticated-session default; restrict rows to their owner.
- `knowledge_documents`: add nullable `user_id` with an authenticated-session default; restrict rows to their owner.
- `knowledge_chunks`: add nullable `user_id` with an authenticated-session default; restrict rows to their owner.
- `search_logs`: replace unrestricted authenticated access with owner-scoped access.
- `oauth_configs`, `search_settings`, `knowledge_settings`: remove direct browser access because these tables contain shared configuration and/or secrets; trusted server functions retain access.
- `users`, `role_permissions`: remove direct browser write access so roles, permissions, and directory records cannot be self-assigned or modified by arbitrary accounts.

3. Storage
- Make the `documents` bucket private.
- Restrict `documents` and `knowledge-files` object operations to paths beginning with the authenticated user's ID.

4. Security notes
- Policies are split by CRUD operation and scoped to `authenticated`.
- Existing ownerless rows are not deleted. They require an explicit, trusted reassignment before they can be used again.
- Browser roles cannot select the raw `ai_connections.api_key` or `oauth_configs.client_secret` columns.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ai_connections' AND column_name = 'user_id') THEN
    ALTER TABLE public.ai_connections ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'automations' AND column_name = 'user_id') THEN
    ALTER TABLE public.automations ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'automation_runs' AND column_name = 'user_id') THEN
    ALTER TABLE public.automation_runs ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'knowledge_bases' AND column_name = 'user_id') THEN
    ALTER TABLE public.knowledge_bases ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'knowledge_documents' AND column_name = 'user_id') THEN
    ALTER TABLE public.knowledge_documents ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'knowledge_chunks' AND column_name = 'user_id') THEN
    ALTER TABLE public.knowledge_chunks ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ai_connections_user_id_idx ON public.ai_connections(user_id);
CREATE INDEX IF NOT EXISTS automations_user_id_idx ON public.automations(user_id);
CREATE INDEX IF NOT EXISTS automation_runs_user_id_idx ON public.automation_runs(user_id);
CREATE INDEX IF NOT EXISTS knowledge_bases_user_id_idx ON public.knowledge_bases(user_id);
CREATE INDEX IF NOT EXISTS knowledge_documents_user_id_idx ON public.knowledge_documents(user_id);
CREATE INDEX IF NOT EXISTS knowledge_chunks_user_id_idx ON public.knowledge_chunks(user_id);

REVOKE ALL ON public.ai_connections FROM anon;
REVOKE SELECT (api_key) ON public.ai_connections FROM anon, authenticated;
DROP POLICY IF EXISTS "select_ai_connections" ON public.ai_connections;
DROP POLICY IF EXISTS "insert_ai_connections" ON public.ai_connections;
DROP POLICY IF EXISTS "update_ai_connections" ON public.ai_connections;
DROP POLICY IF EXISTS "delete_ai_connections" ON public.ai_connections;
CREATE POLICY "select_own_ai_connections" ON public.ai_connections FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "insert_own_ai_connections" ON public.ai_connections FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "update_own_ai_connections" ON public.ai_connections FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "delete_own_ai_connections" ON public.ai_connections FOR DELETE TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.automations FROM anon;
DROP POLICY IF EXISTS "select_automations" ON public.automations;
DROP POLICY IF EXISTS "insert_automations" ON public.automations;
DROP POLICY IF EXISTS "update_automations" ON public.automations;
DROP POLICY IF EXISTS "delete_automations" ON public.automations;
CREATE POLICY "select_own_automations" ON public.automations FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "insert_own_automations" ON public.automations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "update_own_automations" ON public.automations FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "delete_own_automations" ON public.automations FOR DELETE TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.automation_runs FROM anon;
DROP POLICY IF EXISTS "select_automation_runs" ON public.automation_runs;
DROP POLICY IF EXISTS "insert_automation_runs" ON public.automation_runs;
DROP POLICY IF EXISTS "delete_automation_runs" ON public.automation_runs;
CREATE POLICY "select_own_automation_runs" ON public.automation_runs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "insert_own_automation_runs" ON public.automation_runs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "delete_own_automation_runs" ON public.automation_runs FOR DELETE TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.knowledge_bases FROM anon;
DROP POLICY IF EXISTS "anon_select_knowledge_bases" ON public.knowledge_bases;
DROP POLICY IF EXISTS "anon_insert_knowledge_bases" ON public.knowledge_bases;
DROP POLICY IF EXISTS "anon_update_knowledge_bases" ON public.knowledge_bases;
DROP POLICY IF EXISTS "anon_delete_knowledge_bases" ON public.knowledge_bases;
CREATE POLICY "select_own_knowledge_bases" ON public.knowledge_bases FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "insert_own_knowledge_bases" ON public.knowledge_bases FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "update_own_knowledge_bases" ON public.knowledge_bases FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "delete_own_knowledge_bases" ON public.knowledge_bases FOR DELETE TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.knowledge_documents FROM anon;
DROP POLICY IF EXISTS "anon_select_knowledge_documents" ON public.knowledge_documents;
DROP POLICY IF EXISTS "anon_insert_knowledge_documents" ON public.knowledge_documents;
DROP POLICY IF EXISTS "anon_update_knowledge_documents" ON public.knowledge_documents;
DROP POLICY IF EXISTS "anon_delete_knowledge_documents" ON public.knowledge_documents;
CREATE POLICY "select_own_knowledge_documents" ON public.knowledge_documents FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "insert_own_knowledge_documents" ON public.knowledge_documents FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "update_own_knowledge_documents" ON public.knowledge_documents FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "delete_own_knowledge_documents" ON public.knowledge_documents FOR DELETE TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.knowledge_chunks FROM anon;
DROP POLICY IF EXISTS "anon_select_knowledge_chunks" ON public.knowledge_chunks;
DROP POLICY IF EXISTS "anon_insert_knowledge_chunks" ON public.knowledge_chunks;
DROP POLICY IF EXISTS "anon_update_knowledge_chunks" ON public.knowledge_chunks;
DROP POLICY IF EXISTS "anon_delete_knowledge_chunks" ON public.knowledge_chunks;
CREATE POLICY "select_own_knowledge_chunks" ON public.knowledge_chunks FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "insert_own_knowledge_chunks" ON public.knowledge_chunks FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "update_own_knowledge_chunks" ON public.knowledge_chunks FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "delete_own_knowledge_chunks" ON public.knowledge_chunks FOR DELETE TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.search_logs FROM anon;
DROP POLICY IF EXISTS "anon_insert_search_logs" ON public.search_logs;
DROP POLICY IF EXISTS "authed_select_search_logs" ON public.search_logs;
DROP POLICY IF EXISTS "authed_delete_search_logs" ON public.search_logs;
CREATE POLICY "insert_own_search_logs" ON public.search_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "select_own_search_logs" ON public.search_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "delete_own_search_logs" ON public.search_logs FOR DELETE TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.oauth_configs FROM anon, authenticated;
DROP POLICY IF EXISTS "anon_select_oauth_configs" ON public.oauth_configs;
DROP POLICY IF EXISTS "anon_insert_oauth_configs" ON public.oauth_configs;
DROP POLICY IF EXISTS "anon_update_oauth_configs" ON public.oauth_configs;
DROP POLICY IF EXISTS "anon_delete_oauth_configs" ON public.oauth_configs;

REVOKE ALL ON public.search_settings FROM anon, authenticated;
DROP POLICY IF EXISTS "anon_select_search_settings" ON public.search_settings;
DROP POLICY IF EXISTS "anon_insert_search_settings" ON public.search_settings;
DROP POLICY IF EXISTS "anon_update_search_settings" ON public.search_settings;
DROP POLICY IF EXISTS "anon_delete_search_settings" ON public.search_settings;

REVOKE ALL ON public.knowledge_settings FROM anon, authenticated;
DROP POLICY IF EXISTS "anon_select_knowledge_settings" ON public.knowledge_settings;
DROP POLICY IF EXISTS "anon_insert_knowledge_settings" ON public.knowledge_settings;
DROP POLICY IF EXISTS "anon_update_knowledge_settings" ON public.knowledge_settings;
DROP POLICY IF EXISTS "anon_delete_knowledge_settings" ON public.knowledge_settings;

REVOKE ALL ON public.users FROM anon, authenticated;
DROP POLICY IF EXISTS "anon_select_users" ON public.users;
DROP POLICY IF EXISTS "anon_insert_users" ON public.users;
DROP POLICY IF EXISTS "anon_update_users" ON public.users;
DROP POLICY IF EXISTS "anon_delete_users" ON public.users;

REVOKE INSERT, UPDATE, DELETE ON public.role_permissions FROM anon, authenticated;
DROP POLICY IF EXISTS "select_own_role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "insert_own_role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "update_own_role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "delete_own_role_permissions" ON public.role_permissions;
CREATE POLICY "read_role_permissions" ON public.role_permissions FOR SELECT TO authenticated USING (true);

UPDATE storage.buckets SET public = false WHERE id IN ('documents', 'knowledge-files');

DROP POLICY IF EXISTS "Users can upload own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents" ON storage.objects;
CREATE POLICY "Users can upload own documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can read own documents" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can update own documents" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text) WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can delete own documents" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "knowledge_files_read" ON storage.objects;
DROP POLICY IF EXISTS "knowledge_files_insert" ON storage.objects;
DROP POLICY IF EXISTS "knowledge_files_update" ON storage.objects;
DROP POLICY IF EXISTS "knowledge_files_delete" ON storage.objects;
CREATE POLICY "knowledge_files_read_own" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'knowledge-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "knowledge_files_insert_own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'knowledge-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "knowledge_files_update_own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'knowledge-files' AND (storage.foldername(name))[1] = auth.uid()::text) WITH CHECK (bucket_id = 'knowledge-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "knowledge_files_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'knowledge-files' AND (storage.foldername(name))[1] = auth.uid()::text);
