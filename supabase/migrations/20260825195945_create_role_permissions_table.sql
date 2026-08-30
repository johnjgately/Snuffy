/*
# Create role_permissions table for CRUD Role Permission Matrix

1. New Tables
- `role_permissions`
  - `id` (uuid, primary key)
  - `capability` (text, not null) — e.g. "AI Chat", "Documents"
  - `capability_icon` (text, nullable) — icon name from lucide-react
  - `role` (text, not null) — one of: Administrator, Operator, Analyst, Auditor, Viewer
  - `access_level` (text, not null) — one of: full, admin, write, read, none
  - `created_at` (timestamptz, defaults to now())
  - Unique constraint on (capability, role) to prevent duplicates

2. Security
- Enable RLS on `role_permissions`.
- Owner-scoped CRUD for authenticated users.
*/

CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability text NOT NULL,
  capability_icon text,
  role text NOT NULL CHECK (role IN ('Administrator', 'Operator', 'Analyst', 'Auditor', 'Viewer')),
  access_level text NOT NULL CHECK (access_level IN ('full', 'admin', 'write', 'read', 'none')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (capability, role)
);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_role_permissions" ON role_permissions;
CREATE POLICY "select_own_role_permissions" ON role_permissions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_role_permissions" ON role_permissions;
CREATE POLICY "insert_own_role_permissions" ON role_permissions FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_role_permissions" ON role_permissions;
CREATE POLICY "update_own_role_permissions" ON role_permissions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_own_role_permissions" ON role_permissions;
CREATE POLICY "delete_own_role_permissions" ON role_permissions FOR DELETE
  TO authenticated USING (true);

-- Seed default permission matrix
INSERT INTO role_permissions (capability, capability_icon, role, access_level) VALUES
  ('AI Chat', 'Cpu', 'Administrator', 'full'),
  ('AI Chat', 'Cpu', 'Operator', 'full'),
  ('AI Chat', 'Cpu', 'Analyst', 'full'),
  ('AI Chat', 'Cpu', 'Auditor', 'read'),
  ('AI Chat', 'Cpu', 'Viewer', 'none'),
  ('Documents', 'FileText', 'Administrator', 'full'),
  ('Documents', 'FileText', 'Operator', 'full'),
  ('Documents', 'FileText', 'Analyst', 'full'),
  ('Documents', 'FileText', 'Auditor', 'read'),
  ('Documents', 'FileText', 'Viewer', 'read'),
  ('Databases', 'Database', 'Administrator', 'admin'),
  ('Databases', 'Database', 'Operator', 'write'),
  ('Databases', 'Database', 'Analyst', 'read'),
  ('Databases', 'Database', 'Auditor', 'read'),
  ('Databases', 'Database', 'Viewer', 'none'),
  ('Voice', 'Mic', 'Administrator', 'full'),
  ('Voice', 'Mic', 'Operator', 'full'),
  ('Voice', 'Mic', 'Analyst', 'none'),
  ('Voice', 'Mic', 'Auditor', 'none'),
  ('Voice', 'Mic', 'Viewer', 'none'),
  ('Automations', 'Workflow', 'Administrator', 'full'),
  ('Automations', 'Workflow', 'Operator', 'full'),
  ('Automations', 'Workflow', 'Analyst', 'none'),
  ('Automations', 'Workflow', 'Auditor', 'read'),
  ('Automations', 'Workflow', 'Viewer', 'none'),
  ('Audit Logs', 'ScrollText', 'Administrator', 'full'),
  ('Audit Logs', 'ScrollText', 'Operator', 'none'),
  ('Audit Logs', 'ScrollText', 'Analyst', 'none'),
  ('Audit Logs', 'ScrollText', 'Auditor', 'full'),
  ('Audit Logs', 'ScrollText', 'Viewer', 'read'),
  ('Integrations', 'Plug', 'Administrator', 'full'),
  ('Integrations', 'Plug', 'Operator', 'write'),
  ('Integrations', 'Plug', 'Analyst', 'none'),
  ('Integrations', 'Plug', 'Auditor', 'read'),
  ('Integrations', 'Plug', 'Viewer', 'none'),
  ('Feature Flags', 'UserCog', 'Administrator', 'full'),
  ('Feature Flags', 'UserCog', 'Operator', 'none'),
  ('Feature Flags', 'UserCog', 'Analyst', 'none'),
  ('Feature Flags', 'UserCog', 'Auditor', 'read'),
  ('Feature Flags', 'UserCog', 'Viewer', 'none')
ON CONFLICT (capability, role) DO NOTHING;