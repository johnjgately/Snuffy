/*
# Create markets table and link organizations to markets

## Purpose
Establishes a true multi-tenant market system. A "market" is a top-level organizational tenant.
Each organization belongs to exactly one market. Every organization-owned record inherits
its market_id from its organization. Cross-market data access is denied by default.

## Changes

### 1. New table: `markets`
- `id` (uuid, PK)
- `name` (text, unique, NOT NULL) — human-readable market name
- `slug` (text, unique, NOT NULL) — URL-safe identifier
- `description` (text, nullable) — optional description
- `status` (text, NOT NULL, default 'active') — active | suspended | archived
- `owner_user_id` (uuid, FK auth.users) — platform admin who created this market
- `created_by_user_id` (uuid, FK auth.users)
- `updated_by_user_id` (uuid, FK auth.users)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### 2. Add `market_id` to `organizations`
- `market_id` (uuid, FK markets, nullable initially for backfill)

### 3. Add `market_id` to all organization-owned tables
- `ai_connections`, `automations`, `automation_runs`, `documents`, `document_folders`,
  `knowledge_bases`, `knowledge_documents`, `knowledge_chunks`, `knowledge_settings`,
  `oauth_configs`, `role_permissions`, `search_settings`, `search_logs`, `file_metadata`

### 4. Backfill market_id from organizations
- Create a "Default Market" if none exists and assign all orgs to it.
- For each row with an organization_id, set market_id to the organization's market_id.

### 5. Enforce NOT NULL on market_id for organizations table only

### 6. RLS on markets
- Platform admins can CRUD markets
- All authenticated users can read active markets

### 7. Helper functions for market-based RLS
- `get_org_market_id(p_org_id)` — returns the market_id of an organization
- `is_same_market(p_record_market_id)` — checks if record market matches user's active org market

## Security
- Markets table has RLS enabled
- Only platform admins can create/modify/delete markets
- All authenticated users can read market names for UI context
*/

-- 1. Create markets table
CREATE TABLE IF NOT EXISTS markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE markets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_crud_markets" ON markets;
CREATE POLICY "admin_crud_markets" ON markets
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "all_read_markets" ON markets;
CREATE POLICY "all_read_markets" ON markets
  FOR SELECT TO authenticated
  USING (status = 'active' OR is_admin());

-- 2. Add market_id to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS market_id uuid REFERENCES markets(id) ON DELETE SET NULL;

-- 3. Add market_id to all org-owned tables
ALTER TABLE ai_connections ADD COLUMN IF NOT EXISTS market_id uuid;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS market_id uuid;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS market_id uuid;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS market_id uuid;
ALTER TABLE document_folders ADD COLUMN IF NOT EXISTS market_id uuid;
ALTER TABLE knowledge_bases ADD COLUMN IF NOT EXISTS market_id uuid;
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS market_id uuid;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS market_id uuid;
ALTER TABLE knowledge_settings ADD COLUMN IF NOT EXISTS market_id uuid;
ALTER TABLE oauth_configs ADD COLUMN IF NOT EXISTS market_id uuid;
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS market_id uuid;
ALTER TABLE search_settings ADD COLUMN IF NOT EXISTS market_id uuid;
ALTER TABLE search_logs ADD COLUMN IF NOT EXISTS market_id uuid;
ALTER TABLE file_metadata ADD COLUMN IF NOT EXISTS market_id uuid;

-- 4. Backfill: create a default market if none exists
INSERT INTO markets (name, slug, description, status)
SELECT 'Default Market', 'default', 'Default market created during multi-tenant migration', 'active'
WHERE NOT EXISTS (SELECT 1 FROM markets LIMIT 1);

-- Backfill organizations.market_id
UPDATE organizations
SET market_id = (SELECT id FROM markets WHERE slug = 'default')
WHERE market_id IS NULL;

-- Backfill market_id on all org-owned tables from their organization's market_id
UPDATE ai_connections SET market_id = o.market_id FROM organizations o WHERE ai_connections.organization_id = o.id AND ai_connections.market_id IS NULL AND o.market_id IS NOT NULL;
UPDATE automations SET market_id = o.market_id FROM organizations o WHERE automations.organization_id = o.id AND automations.market_id IS NULL AND o.market_id IS NOT NULL;
UPDATE automation_runs SET market_id = o.market_id FROM organizations o WHERE automation_runs.organization_id = o.id AND automation_runs.market_id IS NULL AND o.market_id IS NOT NULL;
UPDATE documents SET market_id = o.market_id FROM organizations o WHERE documents.organization_id = o.id AND documents.market_id IS NULL AND o.market_id IS NOT NULL;
UPDATE document_folders SET market_id = o.market_id FROM organizations o WHERE document_folders.organization_id = o.id AND document_folders.market_id IS NULL AND o.market_id IS NOT NULL;
UPDATE knowledge_bases SET market_id = o.market_id FROM organizations o WHERE knowledge_bases.organization_id = o.id AND knowledge_bases.market_id IS NULL AND o.market_id IS NOT NULL;
UPDATE knowledge_documents SET market_id = o.market_id FROM organizations o WHERE knowledge_documents.organization_id = o.id AND knowledge_documents.market_id IS NULL AND o.market_id IS NOT NULL;
UPDATE knowledge_chunks SET market_id = o.market_id FROM organizations o WHERE knowledge_chunks.organization_id = o.id AND knowledge_chunks.market_id IS NULL AND o.market_id IS NOT NULL;
UPDATE knowledge_settings SET market_id = o.market_id FROM organizations o WHERE knowledge_settings.organization_id = o.id AND knowledge_settings.market_id IS NULL AND o.market_id IS NOT NULL;
UPDATE oauth_configs SET market_id = o.market_id FROM organizations o WHERE oauth_configs.organization_id = o.id AND oauth_configs.market_id IS NULL AND o.market_id IS NOT NULL;
UPDATE role_permissions SET market_id = o.market_id FROM organizations o WHERE role_permissions.organization_id = o.id AND role_permissions.market_id IS NULL AND o.market_id IS NOT NULL;
UPDATE search_settings SET market_id = o.market_id FROM organizations o WHERE search_settings.organization_id = o.id AND search_settings.market_id IS NULL AND o.market_id IS NOT NULL;
UPDATE search_logs SET market_id = o.market_id FROM organizations o WHERE search_logs.organization_id = o.id AND search_logs.market_id IS NULL AND o.market_id IS NOT NULL;
UPDATE file_metadata SET market_id = o.market_id FROM organizations o WHERE file_metadata.organization_id = o.id AND file_metadata.market_id IS NULL AND o.market_id IS NOT NULL;

-- 5. Enforce NOT NULL on organizations.market_id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE market_id IS NULL) THEN
    ALTER TABLE organizations ALTER COLUMN market_id SET NOT NULL;
  END IF;
END $$;

-- 6. Helper functions
CREATE OR REPLACE FUNCTION get_org_market_id(p_org_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT market_id FROM organizations WHERE id = p_org_id;
$$;

CREATE OR REPLACE FUNCTION is_same_market(p_record_market_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    p_record_market_id = (
      SELECT o.market_id
      FROM organization_memberships om
      JOIN organizations o ON o.id = om.organization_id
      WHERE om.user_id = auth.uid()
      AND om.status = 'active'
      ORDER BY om.created_at DESC
      LIMIT 1
    ),
    false
  )
$$;

-- 7. Indexes on market_id
CREATE INDEX IF NOT EXISTS idx_organizations_market_id ON organizations (market_id);
CREATE INDEX IF NOT EXISTS idx_ai_connections_market_id ON ai_connections (market_id);
CREATE INDEX IF NOT EXISTS idx_automations_market_id ON automations (market_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_market_id ON automation_runs (market_id);
CREATE INDEX IF NOT EXISTS idx_documents_market_id ON documents (market_id);
CREATE INDEX IF NOT EXISTS idx_document_folders_market_id ON document_folders (market_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_market_id ON knowledge_bases (market_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_market_id ON knowledge_documents (market_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_market_id ON knowledge_chunks (market_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_settings_market_id ON knowledge_settings (market_id);
CREATE INDEX IF NOT EXISTS idx_oauth_configs_market_id ON oauth_configs (market_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_market_id ON role_permissions (market_id);
CREATE INDEX IF NOT EXISTS idx_search_settings_market_id ON search_settings (market_id);
CREATE INDEX IF NOT EXISTS idx_search_logs_market_id ON search_logs (market_id);
CREATE INDEX IF NOT EXISTS idx_file_metadata_market_id ON file_metadata (market_id);
