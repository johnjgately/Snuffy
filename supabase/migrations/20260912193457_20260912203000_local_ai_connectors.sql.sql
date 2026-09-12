/*
# Local AI connector registry with SSRF prevention

## Purpose
Implements an administrator-managed trusted gateway/connector system for local AI endpoints.
Users cannot enter arbitrary URLs. All requests route through registered connectors with
allowlisted endpoints, health status, and certificate configuration.

## Changes

### 1. New table: `local_ai_connectors`
- `id` (uuid, PK)
- `name` (text, NOT NULL) — connector display name
- `description` (text, nullable)
- `organization_id` (uuid, FK organizations, nullable) — scoped org
- `market_id` (uuid, FK markets, nullable) — scoped market
- `allowlisted_endpoints` (jsonb, NOT NULL) — array of {endpoint, method, max_request_size, max_response_size, timeout_ms, allowed_model_path}
- `health_status` (text, default 'unknown') — unknown | healthy | unhealthy | degraded
- `health_checked_at` (timestamptz, nullable)
- `health_error` (text, nullable)
- `cert_config` (jsonb, nullable) — certificate/authentication configuration
- `owner_user_id` (uuid, FK auth.users) — connector admin
- `created_by_user_id` (uuid, FK auth.users)
- `updated_by_user_id` (uuid, FK auth.users)
- `approved` (boolean, default false) — requires platform admin approval
- `approved_by` (uuid, FK auth.users, nullable)
- `approved_at` (timestamptz, nullable)
- `created_at`, `updated_at`
- `review_date` (timestamptz, nullable) — scheduled review date

### 2. New table: `local_ai_connector_requests`
- Audit log of all requests routed through a connector
- `id` (uuid, PK)
- `connector_id` (uuid, FK local_ai_connectors)
- `user_id` (uuid, FK auth.users)
- `endpoint` (text) — the endpoint that was called
- `method` (text) — HTTP method
- `request_size` (integer, nullable) — bytes
- `response_size` (integer, nullable) — bytes
- `status_code` (integer, nullable)
- `duration_ms` (integer, nullable)
- `success` (boolean)
- `error` (text, nullable)
- `created_at` (timestamptz, default now())

### 3. RLS
- Platform admins can CRUD connectors
- Org admins can read connectors for their org
- All authenticated users can read connector names/status for UI
- Request logs: admins only

## Security
- Only platform admins can approve/register connectors
- Endpoints are allowlisted — no arbitrary URLs
- All requests are logged for audit
*/

CREATE TABLE IF NOT EXISTS local_ai_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  market_id uuid REFERENCES markets(id) ON DELETE SET NULL,
  allowlisted_endpoints jsonb NOT NULL DEFAULT '[]'::jsonb,
  health_status text NOT NULL DEFAULT 'unknown' CHECK (health_status IN ('unknown', 'healthy', 'unhealthy', 'degraded')),
  health_checked_at timestamptz,
  health_error text,
  cert_config jsonb,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved boolean NOT NULL DEFAULT false,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  review_date timestamptz
);

ALTER TABLE local_ai_connectors ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read connector info
DROP POLICY IF EXISTS "all_read_connectors" ON local_ai_connectors;
CREATE POLICY "all_read_connectors" ON local_ai_connectors
  FOR SELECT TO authenticated
  USING (true);

-- Only admins can create/update/delete
DROP POLICY IF EXISTS "admin_insert_connectors" ON local_ai_connectors;
CREATE POLICY "admin_insert_connectors" ON local_ai_connectors
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_connectors" ON local_ai_connectors;
CREATE POLICY "admin_update_connectors" ON local_ai_connectors
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_connectors" ON local_ai_connectors;
CREATE POLICY "admin_delete_connectors" ON local_ai_connectors
  FOR DELETE TO authenticated
  USING (is_admin());

-- Request log table
CREATE TABLE IF NOT EXISTS local_ai_connector_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id uuid NOT NULL REFERENCES local_ai_connectors(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  endpoint text NOT NULL,
  method text NOT NULL,
  request_size integer,
  response_size integer,
  status_code integer,
  duration_ms integer,
  success boolean NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE local_ai_connector_requests ENABLE ROW LEVEL SECURITY;

-- Only admins can read request logs
DROP POLICY IF EXISTS "admin_read_connector_requests" ON local_ai_connector_requests;
CREATE POLICY "admin_read_connector_requests" ON local_ai_connector_requests
  FOR SELECT TO authenticated
  USING (is_admin());

-- Only edge functions (service role) insert request logs
-- No user INSERT policy needed

CREATE INDEX IF NOT EXISTS idx_connector_requests_connector ON local_ai_connector_requests (connector_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connectors_org ON local_ai_connectors (organization_id);
CREATE INDEX IF NOT EXISTS idx_connectors_market ON local_ai_connectors (market_id);
