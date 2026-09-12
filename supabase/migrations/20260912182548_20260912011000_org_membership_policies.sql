/*
# Add RLS Policies for Organizations and Memberships

## Policies
- organizations: SELECT for members/admins; INSERT for creator; UPDATE for org admin/owner; DELETE for owner/admin
- organization_memberships: SELECT for member/org admin; INSERT/UPDATE/DELETE for org admin/owner
*/

-- ============================================================
-- Organizations policies
-- ============================================================
DROP POLICY IF EXISTS "select_org_members" ON public.organizations;
CREATE POLICY "select_org_members" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.organization_id = organizations.id
        AND om.user_id = auth.uid() AND om.status = 'active'
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "insert_org_creator" ON public.organizations;
CREATE POLICY "insert_org_creator" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() AND created_by_user_id = auth.uid());

DROP POLICY IF EXISTS "update_org_admin" ON public.organizations;
CREATE POLICY "update_org_admin" ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.organization_id = organizations.id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'administrator') AND om.status = 'active'
    )
    OR public.is_admin()
  )
  WITH CHECK (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.organization_id = organizations.id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'administrator') AND om.status = 'active'
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "delete_org_owner" ON public.organizations;
CREATE POLICY "delete_org_owner" ON public.organizations
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid() OR public.is_admin());

-- ============================================================
-- Memberships policies
-- ============================================================
DROP POLICY IF EXISTS "select_own_memberships" ON public.organization_memberships;
CREATE POLICY "select_own_memberships" ON public.organization_memberships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships om2
      WHERE om2.organization_id = organization_memberships.organization_id
        AND om2.user_id = auth.uid()
        AND om2.role IN ('owner', 'administrator', 'manager') AND om2.status = 'active'
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "insert_membership_admin" ON public.organization_memberships;
CREATE POLICY "insert_membership_admin" ON public.organization_memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om2
      WHERE om2.organization_id = organization_memberships.organization_id
        AND om2.user_id = auth.uid()
        AND om2.role IN ('owner', 'administrator') AND om2.status = 'active'
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "update_membership_admin" ON public.organization_memberships;
CREATE POLICY "update_membership_admin" ON public.organization_memberships
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships om2
      WHERE om2.organization_id = organization_memberships.organization_id
        AND om2.user_id = auth.uid()
        AND om2.role IN ('owner', 'administrator') AND om2.status = 'active'
    )
    OR public.is_admin()
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships om2
      WHERE om2.organization_id = organization_memberships.organization_id
        AND om2.user_id = auth.uid()
        AND om2.role IN ('owner', 'administrator') AND om2.status = 'active'
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "delete_membership_admin" ON public.organization_memberships;
CREATE POLICY "delete_membership_admin" ON public.organization_memberships
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships om2
      WHERE om2.organization_id = organization_memberships.organization_id
        AND om2.user_id = auth.uid()
        AND om2.role IN ('owner', 'administrator') AND om2.status = 'active'
    )
    OR public.is_admin()
  );
