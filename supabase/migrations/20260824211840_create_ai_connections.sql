/*
# Create ai_connections table (single-tenant, no auth)

1. New Tables
- `ai_connections`
  - `id` (uuid, primary key)
  - `name` (text, not null) — display name
  - `kind` (text, not null) — 'cloud' or 'local'
  - `provider` (text, not null) — e.g. "OpenAI", "Ollama"
  - `endpoint` (text, not null) — URL or host:port
  - `models` (text array, default empty) — list of model names
  - `enabled` (boolean, default false)
  - `status` (text, default 'offline') — 'healthy' | 'degraded' | 'offline'
  - `usage_tokens` (integer, default 0)
  - `usage_cost` (numeric, default 0)
  - `key_masked` (text, nullable) — masked API key for display
  - `created_at` (timestamp, defaults to now)

2. Security
- Enable RLS on `ai_connections`.
- Allow anon + authenticated full CRUD because the app has no sign-in and the data is intentionally shared/public.
*/

CREATE TABLE IF NOT EXISTS ai_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'cloud' CHECK (kind IN ('cloud', 'local')),
  provider text NOT NULL,
  endpoint text NOT NULL,
  models text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('healthy', 'degraded', 'offline')),
  usage_tokens integer NOT NULL DEFAULT 0,
  usage_cost numeric(12,4) NOT NULL DEFAULT 0,
  key_masked text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ai_connections" ON ai_connections;
CREATE POLICY "anon_select_ai_connections" ON ai_connections FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ai_connections" ON ai_connections;
CREATE POLICY "anon_insert_ai_connections" ON ai_connections FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_ai_connections" ON ai_connections;
CREATE POLICY "anon_update_ai_connections" ON ai_connections FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_ai_connections" ON ai_connections;
CREATE POLICY "anon_delete_ai_connections" ON ai_connections FOR DELETE
  TO anon, authenticated USING (true);
