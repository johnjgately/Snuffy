/*
# Create automations table

1. New Tables
- `automations`
  - `id` (uuid, primary key)
  - `name` (text, not null)
  - `description` (text, not null, default '')
  - `trigger` (text, not null, default 'Manual') — what starts the automation
  - `action` (text, not null, default 'Notify') — what the automation does
  - `schedule` (text, not null, default 'Manual')
  - `enabled` (boolean, default false)
  - `status` (text, default 'idle') — one of: idle, running, paused, failed
  - `last_run` (text, default 'Never')
  - `runs` (integer, default 0)
  - `created_at` (timestamp, defaults to now)

2. Security
- Enable RLS. Allow anon + authenticated full CRUD (no-auth app, shared data).
*/

CREATE TABLE IF NOT EXISTS automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  trigger text NOT NULL DEFAULT 'Manual',
  action text NOT NULL DEFAULT 'Notify',
  schedule text NOT NULL DEFAULT 'Manual',
  enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'paused', 'failed')),
  last_run text NOT NULL DEFAULT 'Never',
  runs integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE automations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_automations" ON automations;
CREATE POLICY "anon_select_automations" ON automations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_automations" ON automations;
CREATE POLICY "anon_insert_automations" ON automations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_automations" ON automations;
CREATE POLICY "anon_update_automations" ON automations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_automations" ON automations;
CREATE POLICY "anon_delete_automations" ON automations FOR DELETE
  TO anon, authenticated USING (true);
