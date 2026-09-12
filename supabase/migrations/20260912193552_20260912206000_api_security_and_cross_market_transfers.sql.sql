/*
# API security: rate limiting, cross-market transfers, audit integrity

## Purpose
Implements API rate-limit tracking, cross-market transfer approvals, audit-log integrity
hashes, and cross-market share approvals.

## Changes

### 1. New table: `api_rate_limits`
- Per-user, per-IP, per-endpoint rate limit tracking
- `id` (uuid, PK)
- `identifier` (text, NOT NULL) — user_id or IP address
- `endpoint` (text, NOT NULL) — API endpoint or resource
- `request_count` (integer, default 1)
- `window_start` (timestamptz, NOT NULL)
- `window_end` (timestamptz, NOT NULL)
- Unique on (identifier, endpoint, window_start)

### 2. New table: `cross_market_transfers`
- Records of cross-organization/cross-market ownership transfers requiring platform admin approval
- `id` (uuid, PK)
- `entity_type` (text, NOT NULL) — table name
- `entity_id` (uuid, NOT NULL)
- `from_organization_id` (uuid, nullable)
- `to_organization_id` (uuid, nullable)
- `from_market_id` (uuid, nullable)
- `to_market_id` (uuid, nullable)
- `from_owner_user_id` (uuid, nullable)
- `to_owner_user_id` (uuid, nullable)
- `requested_by` (uuid, FK auth.users)
- `reason` (text, NOT NULL)
- `status` (text, default 'pending') — pending | approved | denied | completed
- `approved_by` (uuid, nullable)
- `approved_at` (timestamptz, nullable)
- `approval_reason` (text, nullable)
- `created_at`, `completed_at`
- `audit_metadata` (jsonb) — old/new values for audit trail

### 3. New table: `cross_market_shares`
- Cross-market sharing approvals
- `id` (uuid, PK)
- `entity_type` (text, NOT NULL)
- `entity_id` (uuid, NOT NULL)
- `source_market_id` (uuid, nullable)
- `target_market_id` (uuid, nullable)
- `share_scope` (text, NOT NULL) — user | organization | market_approved
- `target_user_id` (uuid, nullable)
- `target_organization_id` (uuid, nullable)
- `approved_by` (uuid, FK auth.users)
- `reason` (text, NOT NULL)
- `status` (text, default 'active') — active | revoked | expired
- `created_at`, `revoked_at`
- `expires_at` (timestamptz, nullable)

### 4. Column added to `audit_logs`
- `integrity_hash` (text, nullable) — SHA256 hash of the log entry for tamper detection
- `previous_hash` (text, nullable) — chain hash for integrity verification

### 5. Column added to `record_shares`
- `market_id` (uuid, nullable) — market scope for the share
- `share_scope` (text, default 'user') — user | organization | market_approved
- `expires_at` (timestamptz, nullable)
- `revoked_at` (timestamptz, nullable)

### 6. RLS on all new tables
- api_rate_limits: service-role only (no user policies)
- cross_market_transfers: admins can CRUD; org admins can read for their org
- cross_market_shares: admins can CRUD; org admins can read for their org
*/

-- 1. api_rate_limits
CREATE TABLE IF NOT EXISTS api_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  endpoint text NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  UNIQUE (identifier, endpoint, window_start)
);

ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON api_rate_limits (window_end);

-- 2. cross_market_transfers
CREATE TABLE IF NOT EXISTS cross_market_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  from_organization_id uuid,
  to_organization_id uuid,
  from_market_id uuid REFERENCES markets(id) ON DELETE SET NULL,
  to_market_id uuid REFERENCES markets(id) ON DELETE SET NULL,
  from_owner_user_id uuid,
  to_owner_user_id uuid,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'completed')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approval_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  audit_metadata jsonb
);

ALTER TABLE cross_market_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_crud_transfers" ON cross_market_transfers;
CREATE POLICY "admin_crud_transfers" ON cross_market_transfers
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "org_admin_read_transfers" ON cross_market_transfers;
CREATE POLICY "org_admin_read_transfers" ON cross_market_transfers
  FOR SELECT TO authenticated
  USING (
    is_org_admin(from_organization_id)
    OR is_org_admin(to_organization_id)
    OR requested_by = auth.uid()
  );

-- 3. cross_market_shares
CREATE TABLE IF NOT EXISTS cross_market_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  source_market_id uuid REFERENCES markets(id) ON DELETE SET NULL,
  target_market_id uuid REFERENCES markets(id) ON DELETE SET NULL,
  share_scope text NOT NULL CHECK (share_scope IN ('user', 'organization', 'market_approved')),
  target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  target_organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  expires_at timestamptz
);

ALTER TABLE cross_market_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_crud_shares" ON cross_market_shares;
CREATE POLICY "admin_crud_shares" ON cross_market_shares
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "user_read_own_shares" ON cross_market_shares;
CREATE POLICY "user_read_own_shares" ON cross_market_shares
  FOR SELECT TO authenticated
  USING (
    target_user_id = auth.uid()
    OR approved_by = auth.uid()
    OR is_admin()
  );

-- 4. Add integrity hash to audit_logs
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS integrity_hash text;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS previous_hash text;

-- 5. Add columns to record_shares
ALTER TABLE record_shares ADD COLUMN IF NOT EXISTS market_id uuid;
ALTER TABLE record_shares ADD COLUMN IF NOT EXISTS share_scope text NOT NULL DEFAULT 'user';
ALTER TABLE record_shares ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE record_shares ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

-- 6. Function to compute audit log integrity hash
CREATE OR REPLACE FUNCTION compute_audit_integrity(p_id uuid, p_occurred_at timestamptz, p_action text, p_entity_type text, p_entity_id text, p_outcome text, p_previous_hash text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT encode(digest(
    COALESCE(p_id::text, '') || '|' ||
    COALESCE(p_occurred_at::text, '') || '|' ||
    COALESCE(p_action, '') || '|' ||
    COALESCE(p_entity_type, '') || '|' ||
    COALESCE(p_entity_id, '') || '|' ||
    COALESCE(p_outcome, '') || '|' ||
    COALESCE(p_previous_hash, ''),
    'sha256'
  ), 'hex');
$$;

-- 7. Trigger to auto-compute integrity hash on audit log insert
CREATE OR REPLACE FUNCTION set_audit_integrity_hash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_prev_hash text;
BEGIN
  SELECT integrity_hash INTO v_prev_hash
  FROM audit_logs
  ORDER BY occurred_at DESC, id DESC
  LIMIT 1;

  NEW.previous_hash := v_prev_hash;
  NEW.integrity_hash := encode(digest(
    COALESCE(NEW.id::text, '') || '|' ||
    COALESCE(NEW.occurred_at::text, '') || '|' ||
    COALESCE(NEW.action, '') || '|' ||
    COALESCE(NEW.entity_type, '') || '|' ||
    COALESCE(NEW.entity_id, '') || '|' ||
    COALESCE(NEW.outcome, '') || '|' ||
    COALESCE(v_prev_hash, ''),
    'sha256'
  ), 'hex');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_integrity_trigger ON audit_logs;
CREATE TRIGGER audit_integrity_trigger
  BEFORE INSERT ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION set_audit_integrity_hash();
