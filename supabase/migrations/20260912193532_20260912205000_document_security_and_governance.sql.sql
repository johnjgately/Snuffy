/*
# Document security, quarantine, data governance, and legal holds

## Purpose
Implements document quarantine, malware scan tracking, prompt-injection detection flags,
data classifications, legal holds, retention governance, and export logging.

## Changes

### 1. Columns added to `documents`
- `quarantined` (boolean, default false) — suspicious uploads are quarantined
- `quarantine_reason` (text, nullable) — why it was quarantined
- `quarantined_at` (timestamptz, nullable)
- `malware_scan_status` (text, default 'pending') — pending | clean | infected | error
- `malware_scanned_at` (timestamptz, nullable)
- `malware_scan_result` (jsonb, nullable) — detailed scan results
- `prompt_injection_detected` (boolean, default false)
- `prompt_injection_flags` (jsonb, nullable) — detected patterns
- `legal_hold` (boolean, default false) — cannot be deleted while on hold
- `legal_hold_reason` (text, nullable)
- `legal_hold_at` (timestamptz, nullable)
- `legal_hold_by` (uuid, nullable)
- `storage_object_name` (text, nullable) — server-generated unique storage name
- `retention_expires_at` (timestamptz, nullable) — when the document can be purged

### 2. Columns added to `knowledge_documents`
- `quarantined` (boolean, default false)
- `quarantine_reason` (text, nullable)
- `malware_scan_status` (text, default 'pending')
- `prompt_injection_detected` (boolean, default false)
- `prompt_injection_flags` (jsonb, nullable)
- `legal_hold` (boolean, default false)
- `legal_hold_reason` (text, nullable)
- `legal_hold_at` (timestamptz, nullable)
- `legal_hold_by` (uuid, nullable)

### 3. New table: `data_classifications`
- Defines data classification levels
- `id` (uuid, PK)
- `level` (text, unique) — public | internal | confidential | restricted
- `label` (text) — human-readable label
- `description` (text)
- `retention_days` (integer, nullable) — default retention for this level
- `created_at` (timestamptz)

### 4. New table: `legal_holds`
- Master record for legal holds across any entity
- `id` (uuid, PK)
- `entity_type` (text, NOT NULL) — documents | knowledge_documents | automations | etc.
- `entity_id` (uuid, NOT NULL)
- `reason` (text, NOT NULL)
- `placed_by` (uuid, FK auth.users)
- `placed_at` (timestamptz, default now())
- `released_at` (timestamptz, nullable)
- `released_by` (uuid, nullable)
- `release_reason` (text, nullable)
- `metadata` (jsonb, nullable)

### 5. New table: `export_requests`
- Tracks all data export requests
- `id` (uuid, PK)
- `requested_by` (uuid, FK auth.users)
- `scope` (text, NOT NULL) — what was exported
- `entity_type` (text, nullable) — documents | audit_logs | etc.
- `entity_ids` (jsonb, nullable) — specific record IDs
- `status` (text, default 'pending') — pending | processing | completed | failed | expired
- `download_url_expires_at` (timestamptz, nullable)
- `file_size_bytes` (integer, nullable)
- `created_at` (timestamptz, default now())
- `completed_at` (timestamptz, nullable)
- `metadata` (jsonb, nullable)

### 6. New table: `retention_policies`
- Configurable retention by data type and organization
- `id` (uuid, PK)
- `entity_type` (text, NOT NULL) — documents | audit_logs | etc.
- `organization_id` (uuid, FK organizations, nullable) — null = global default
- `market_id` (uuid, FK markets, nullable)
- `retention_days` (integer, NOT NULL)
- `created_at`, `updated_at`
- Unique on (entity_type, organization_id, market_id)

### 7. RLS on all new tables
- data_classifications: all authenticated can read
- legal_holds: admins can CRUD; users can read holds on their own data
- export_requests: users can read/create their own; admins can read all
- retention_policies: admins can CRUD; all can read

## Security
- Quarantined documents are not searchable, downloadable, or included in RAG
- Legal hold prevents deletion by normal retention processes
- Export requests are logged with scope, actor, and result
- Retention policies are configurable per organization
*/

-- 1. Add columns to documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS quarantined boolean NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS quarantine_reason text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS quarantined_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS malware_scan_status text NOT NULL DEFAULT 'pending' CHECK (malware_scan_status IN ('pending', 'clean', 'infected', 'error'));
ALTER TABLE documents ADD COLUMN IF NOT EXISTS malware_scanned_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS malware_scan_result jsonb;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS prompt_injection_detected boolean NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS prompt_injection_flags jsonb;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS legal_hold_reason text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS legal_hold_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS legal_hold_by uuid;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_object_name text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS retention_expires_at timestamptz;

-- 2. Add columns to knowledge_documents
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS quarantined boolean NOT NULL DEFAULT false;
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS quarantine_reason text;
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS malware_scan_status text NOT NULL DEFAULT 'pending' CHECK (malware_scan_status IN ('pending', 'clean', 'infected', 'error'));
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS prompt_injection_detected boolean NOT NULL DEFAULT false;
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS prompt_injection_flags jsonb;
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false;
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS legal_hold_reason text;
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS legal_hold_at timestamptz;
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS legal_hold_by uuid;

-- 3. data_classifications
CREATE TABLE IF NOT EXISTS data_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  retention_days integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE data_classifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "all_read_classifications" ON data_classifications;
CREATE POLICY "all_read_classifications" ON data_classifications
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_crud_classifications" ON data_classifications;
CREATE POLICY "admin_crud_classifications" ON data_classifications
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Seed default classifications
INSERT INTO data_classifications (level, label, description, retention_days) VALUES
  ('public', 'Public', 'Information approved for public release', 365),
  ('internal', 'Internal', 'Internal business information', 730),
  ('confidential', 'Confidential', 'Confidential business data with restricted access', 1095),
  ('restricted', 'Restricted / Sensitive', 'Highly sensitive data requiring special handling', 2555)
ON CONFLICT (level) DO NOTHING;

-- 4. legal_holds
CREATE TABLE IF NOT EXISTS legal_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  reason text NOT NULL,
  placed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  placed_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  released_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  release_reason text,
  metadata jsonb
);

ALTER TABLE legal_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_crud_legal_holds" ON legal_holds;
CREATE POLICY "admin_crud_legal_holds" ON legal_holds
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "user_read_own_legal_holds" ON legal_holds;
CREATE POLICY "user_read_own_legal_holds" ON legal_holds
  FOR SELECT TO authenticated
  USING (
    placed_by = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = legal_holds.entity_id
      AND d.owner_user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_legal_holds_entity ON legal_holds (entity_type, entity_id);

-- 5. export_requests
CREATE TABLE IF NOT EXISTS export_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL,
  entity_type text,
  entity_ids jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired')),
  download_url_expires_at timestamptz,
  file_size_bytes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metadata jsonb
);

ALTER TABLE export_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_exports" ON export_requests;
CREATE POLICY "select_own_exports" ON export_requests
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "insert_own_exports" ON export_requests;
CREATE POLICY "insert_own_exports" ON export_requests
  FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

DROP POLICY IF EXISTS "admin_update_exports" ON export_requests;
CREATE POLICY "admin_update_exports" ON export_requests
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- 6. retention_policies
CREATE TABLE IF NOT EXISTS retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  market_id uuid REFERENCES markets(id) ON DELETE SET NULL,
  retention_days integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "all_read_retention" ON retention_policies;
CREATE POLICY "all_read_retention" ON retention_policies
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_crud_retention" ON retention_policies;
CREATE POLICY "admin_crud_retention" ON retention_policies
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE UNIQUE INDEX IF NOT EXISTS idx_retention_policies_unique ON retention_policies (entity_type, COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(market_id, '00000000-0000-0000-0000-000000000000'::uuid));
