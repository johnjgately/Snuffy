/*
# Create Organizations and Memberships Tables

## Purpose
Enables multi-tenant, multi-market support. Organizations own shared
records; users belong to one or more organizations with roles.

## New Tables
- organizations: id, name, slug, description, market_type, status, ownership columns
- organization_memberships: id, organization_id, user_id, role, status, invited_by, timestamps

## Security
- RLS enabled on both tables
- Helper functions: is_org_member, is_org_admin, can_access_record, can_write_record_typed
- Audit and ownership triggers added
*/

-- ============================================================
-- Organizations table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  market_type text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'active',
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON public.organizations(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON public.organizations(status);

-- ============================================================
-- Organization memberships table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'active',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_org_membership UNIQUE (organization_id, user_id),
  CONSTRAINT chk_membership_role CHECK (role IN ('owner', 'administrator', 'manager', 'member', 'viewer')),
  CONSTRAINT chk_membership_status CHECK (status IN ('active', 'invited', 'suspended'))
);

ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_memberships_org ON public.organization_memberships(organization_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON public.organization_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org_user ON public.organization_memberships(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_role ON public.organization_memberships(role);

-- ============================================================
-- Helper functions
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $_$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_org_id AND user_id = auth.uid() AND status = 'active'
  );
$_$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $_$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_org_id AND user_id = auth.uid()
      AND role IN ('owner', 'administrator') AND status = 'active'
  );
$_$;

CREATE OR REPLACE FUNCTION public.can_access_record(
  p_table_name text, p_owner_user_id uuid, p_organization_id uuid, p_ownership_type text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $_$
BEGIN
  IF public.is_admin() THEN RETURN true; END IF;
  IF p_ownership_type = 'personal' THEN
    RETURN p_owner_user_id = auth.uid();
  ELSIF p_ownership_type = 'organization' THEN
    IF p_organization_id IS NULL THEN RETURN false; END IF;
    RETURN public.is_org_member(p_organization_id);
  ELSIF p_ownership_type = 'shared' THEN
    IF p_owner_user_id = auth.uid() THEN RETURN true; END IF;
    IF p_organization_id IS NOT NULL AND public.is_org_member(p_organization_id) THEN RETURN true; END IF;
    RETURN false;
  ELSE
    RETURN p_owner_user_id = auth.uid();
  END IF;
END;
$_$;

CREATE OR REPLACE FUNCTION public.can_write_record_typed(
  p_table_name text, p_owner_user_id uuid, p_organization_id uuid, p_ownership_type text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $_$
BEGIN
  IF public.is_admin() THEN RETURN true; END IF;
  IF p_ownership_type = 'personal' THEN
    RETURN p_owner_user_id = auth.uid();
  ELSIF p_ownership_type = 'organization' THEN
    IF p_organization_id IS NULL THEN RETURN false; END IF;
    RETURN public.is_org_admin(p_organization_id);
  ELSIF p_ownership_type = 'shared' THEN
    IF p_owner_user_id = auth.uid() THEN RETURN true; END IF;
    IF p_organization_id IS NOT NULL AND public.is_org_admin(p_organization_id) THEN RETURN true; END IF;
    RETURN false;
  ELSE
    RETURN p_owner_user_id = auth.uid();
  END IF;
END;
$_$;

REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_record(text, uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_write_record_typed(text, uuid, uuid, text) FROM anon;

-- ============================================================
-- Triggers
-- ============================================================
DROP TRIGGER IF EXISTS organizations_audit_trigger ON public.organizations;
CREATE TRIGGER organizations_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

DROP TRIGGER IF EXISTS organizations_set_ownership ON public.organizations;
CREATE TRIGGER organizations_set_ownership
  BEFORE INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_ownership_on_insert();

DROP TRIGGER IF EXISTS organizations_set_updated_at ON public.organizations;
CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS memberships_audit_trigger ON public.organization_memberships;
CREATE TRIGGER memberships_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.organization_memberships
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

DROP TRIGGER IF EXISTS memberships_set_updated_at ON public.organization_memberships;
CREATE TRIGGER memberships_set_updated_at
  BEFORE UPDATE ON public.organization_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
