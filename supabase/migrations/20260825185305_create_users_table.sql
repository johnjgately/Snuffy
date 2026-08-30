/*
# Create users table (single-tenant, no auth)

1. New Tables
- `users`
  - `id` (uuid, primary key)
  - `name` (text, not null) — display name
  - `email` (text, not null) — email address
  - `role` (text, not null) — one of: Administrator, Operator, Analyst, Auditor, Viewer
  - `status` (text, not null, default 'invited') — one of: active, suspended, invited
  - `mfa` (boolean, default false) — whether MFA is enabled
  - `permissions` (text array, default empty) — list of permission strings
  - `created_at` (timestamp, defaults to now)

2. Security
- Enable RLS on `users`.
- Allow anon + authenticated full CRUD because the app has no sign-in and the data is intentionally shared/public.
*/

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'Viewer' CHECK (role IN ('Administrator', 'Operator', 'Analyst', 'Auditor', 'Viewer')),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('active', 'suspended', 'invited')),
  mfa boolean NOT NULL DEFAULT false,
  permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_users" ON users;
CREATE POLICY "anon_select_users" ON users FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_users" ON users;
CREATE POLICY "anon_insert_users" ON users FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_users" ON users;
CREATE POLICY "anon_update_users" ON users FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_users" ON users;
CREATE POLICY "anon_delete_users" ON users FOR DELETE
  TO anon, authenticated USING (true);
