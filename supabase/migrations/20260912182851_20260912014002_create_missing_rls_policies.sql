/*
# Create Missing RLS Policies After Partial Migration

Some policies were created by the first (failed) migration attempt.
This creates the remaining missing policies.
*/

-- automation_runs UPDATE (missing)
CREATE POLICY "rbac_update_automation_runs" ON public.automation_runs FOR UPDATE TO authenticated
  USING (public.can_write_record_typed('automation_runs', owner_user_id, organization_id, ownership_type))
  WITH CHECK (public.can_write_record_typed('automation_runs', owner_user_id, organization_id, ownership_type));

-- search_logs UPDATE (missing)
CREATE POLICY "rbac_update_search_logs" ON public.search_logs FOR UPDATE TO authenticated
  USING (public.can_write_record_typed('search_logs', owner_user_id, organization_id, ownership_type))
  WITH CHECK (public.can_write_record_typed('search_logs', owner_user_id, organization_id, ownership_type));

-- file_metadata (all 4 missing — were fully dropped)
CREATE POLICY "rbac_select_file_metadata" ON public.file_metadata FOR SELECT TO authenticated
  USING (public.can_access_record('file_metadata', owner_user_id, organization_id, ownership_type));
CREATE POLICY "rbac_insert_file_metadata" ON public.file_metadata FOR INSERT TO authenticated
  WITH CHECK ((ownership_type = 'personal' AND owner_user_id = auth.uid()) OR (ownership_type = 'organization' AND organization_id IS NOT NULL AND public.is_org_admin(organization_id)) OR public.is_admin());
CREATE POLICY "rbac_update_file_metadata" ON public.file_metadata FOR UPDATE TO authenticated
  USING (public.can_write_record_typed('file_metadata', owner_user_id, organization_id, ownership_type))
  WITH CHECK (public.can_write_record_typed('file_metadata', owner_user_id, organization_id, ownership_type));
CREATE POLICY "rbac_delete_file_metadata" ON public.file_metadata FOR DELETE TO authenticated
  USING (public.can_write_record_typed('file_metadata', owner_user_id, organization_id, ownership_type));

-- knowledge_bases (all 4 missing — were fully dropped)
CREATE POLICY "rbac_select_knowledge_bases" ON public.knowledge_bases FOR SELECT TO authenticated
  USING (public.can_access_record('knowledge_bases', owner_user_id, organization_id, ownership_type));
CREATE POLICY "rbac_insert_knowledge_bases" ON public.knowledge_bases FOR INSERT TO authenticated
  WITH CHECK ((ownership_type = 'personal' AND owner_user_id = auth.uid()) OR (ownership_type = 'organization' AND organization_id IS NOT NULL AND public.is_org_admin(organization_id)) OR public.is_admin());
CREATE POLICY "rbac_update_knowledge_bases" ON public.knowledge_bases FOR UPDATE TO authenticated
  USING (public.can_write_record_typed('knowledge_bases', owner_user_id, organization_id, ownership_type))
  WITH CHECK (public.can_write_record_typed('knowledge_bases', owner_user_id, organization_id, ownership_type));
CREATE POLICY "rbac_delete_knowledge_bases" ON public.knowledge_bases FOR DELETE TO authenticated
  USING (public.can_write_record_typed('knowledge_bases', owner_user_id, organization_id, ownership_type));
