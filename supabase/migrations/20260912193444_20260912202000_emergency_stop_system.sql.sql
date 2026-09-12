/*
# Emergency stop system

## Purpose
Implements independently controlled emergency-stop switches for each platform service.
Platform admins can activate/deactivate with a required reason and audit trail.

## Changes

### 1. New table: `emergency_stop_switches`
- One row per controlled service switch
- `id` (uuid, PK)
- `service` (text, unique) — the service key (ai_requests, web_search, automations,
  document_uploads, rag_indexing, voice_capture, local_ai_connectors, provider_api_keys,
  new_sessions, active_sessions, active_requests)
- `label` (text) — human-readable label
- `is_stopped` (boolean, default false)
- `stopped_by` (uuid, FK auth.users, nullable) — who activated
- `stopped_at` (timestamptz, nullable)
- `reason` (text, nullable) — required reason
- `restored_by` (uuid, FK auth.users, nullable) — who restored
- `restored_at` (timestamptz, nullable)
- `restored_reason` (text, nullable)
- `updated_at` (timestamptz, default now())

### 2. New table: `emergency_stop_history`
- Immutable audit log of all activation/restoration events
- `id` (uuid, PK)
- `service` (text, NOT NULL)
- `action` (text, NOT NULL) — 'activate' | 'restore'
- `actor_user_id` (uuid, FK auth.users)
- `reason` (text, NOT NULL)
- `occurred_at` (timestamptz, default now())
- `metadata` (jsonb, nullable)

### 3. Seed default switches
- All 11 services start as not stopped (is_stopped = false)

### 4. RLS
- Platform admins can read and toggle switches
- All authenticated users can read switch status (to show maintenance messages)
- History is read-only for all (append-only via service role)

## Security
- Only platform admins can activate/restore switches
- Every activation and restoration requires a reason
- History table is append-only (no UPDATE/DELETE policies)
*/

CREATE TABLE IF NOT EXISTS emergency_stop_switches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text UNIQUE NOT NULL,
  label text NOT NULL,
  is_stopped boolean NOT NULL DEFAULT false,
  stopped_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  stopped_at timestamptz,
  reason text,
  restored_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  restored_at timestamptz,
  restored_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE emergency_stop_switches ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read switch status
DROP POLICY IF EXISTS "all_read_emergency_switches" ON emergency_stop_switches;
CREATE POLICY "all_read_emergency_switches" ON emergency_stop_switches
  FOR SELECT TO authenticated
  USING (true);

-- Only admins can update
DROP POLICY IF EXISTS "admin_update_emergency_switches" ON emergency_stop_switches;
CREATE POLICY "admin_update_emergency_switches" ON emergency_stop_switches
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Only admins can insert (for initial setup)
DROP POLICY IF EXISTS "admin_insert_emergency_switches" ON emergency_stop_switches;
CREATE POLICY "admin_insert_emergency_switches" ON emergency_stop_switches
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

-- History table
CREATE TABLE IF NOT EXISTS emergency_stop_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL,
  action text NOT NULL CHECK (action IN ('activate', 'restore')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb
);

ALTER TABLE emergency_stop_history ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read history
DROP POLICY IF EXISTS "all_read_emergency_history" ON emergency_stop_history;
CREATE POLICY "all_read_emergency_history" ON emergency_stop_history
  FOR SELECT TO authenticated
  USING (true);

-- Only admins can insert history records
DROP POLICY IF EXISTS "admin_insert_emergency_history" ON emergency_stop_history;
CREATE POLICY "admin_insert_emergency_history" ON emergency_stop_history
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

-- Seed default switches
INSERT INTO emergency_stop_switches (service, label, is_stopped) VALUES
  ('ai_requests', 'New AI Requests', false),
  ('web_search', 'Web Search / External Retrieval', false),
  ('automations', 'Automations', false),
  ('document_uploads', 'Document Uploads & Processing', false),
  ('rag_indexing', 'RAG Indexing & Retrieval', false),
  ('voice_capture', 'Voice Capture & Processing', false),
  ('local_ai_connectors', 'Local AI Connector Requests', false),
  ('provider_api_keys', 'Provider API Key Use', false),
  ('new_sessions', 'New User Sessions / Sign-ins', false),
  ('active_sessions', 'Active Sessions', false),
  ('active_requests', 'Active Requests / Jobs', false)
ON CONFLICT (service) DO NOTHING;

-- Helper function: check if a service is stopped
CREATE OR REPLACE FUNCTION is_service_stopped(p_service text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_stopped FROM emergency_stop_switches WHERE service = p_service),
    false
  );
$$;
