/*
# Create Internet Search Settings and Search Logs Tables

1. New Tables
- `search_settings`: Single-row configuration table for Snuffy's Internet search system.
  - `id` (uuid, primary key)
  - `enabled` (boolean, default true) — master on/off for Internet search
  - `primary_provider` (text, default 'brave') — primary search provider
  - `fallback_provider` (text, default 'duckduckgo') — fallback provider
  - `auto_fallback` (boolean, default true) — whether to automatically fall back
  - `allow_auto_search` (boolean, default true) — whether AI can auto-trigger search
  - `max_results` (integer, default 10) — max results per search (5/10/20)
  - `safe_search` (text, default 'moderate') — safe search level (off/moderate/strict)
  - `timeout_ms` (integer, default 10000) — search timeout in milliseconds
  - `updated_at` (timestamptz)

- `search_logs`: Audit trail for every Internet search performed.
  - `id` (uuid, primary key)
  - `user_id` (uuid, nullable) — authenticated user who triggered the search
  - `user_email` (text, nullable) — user email for readability
  - `query` (text) — the search query
  - `search_type` (text, default 'web') — web/news/etc
  - `primary_provider` (text) — configured primary provider
  - `provider_used` (text) — which provider actually returned results
  - `is_fallback` (boolean, default false) — whether fallback was used
  - `fallback_reason` (text, nullable) — why fallback occurred
  - `result_count` (integer, default 0)
  - `result_urls` (text[], default '{}') — URLs returned
  - `cited_urls` (text[], nullable) — URLs the AI actually cited
  - `ai_provider` (text, nullable) — which AI provider was used
  - `ai_model` (text, nullable) — which AI model was used
  - `execution_time_ms` (integer, nullable)
  - `success` (boolean, default false)
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on both tables.
- `search_settings`: Allow anon + authenticated full CRUD (shared config, no per-user isolation).
- `search_logs`: Allow anon + authenticated INSERT (anyone can log), SELECT for authenticated (audit visibility).
  Never expose API keys or tokens in logs — only search metadata is stored.

3. Important Notes
- The Brave Search API key (BRAVE_SEARCH_API_KEY) is stored as an edge function secret,
  NOT in this table. It never reaches the browser.
- search_settings is designed as a single-row table (enforced by application logic).
- search_logs never stores authentication tokens, API keys, or passwords.
*/

CREATE TABLE IF NOT EXISTS search_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT true,
  primary_provider text NOT NULL DEFAULT 'brave',
  fallback_provider text NOT NULL DEFAULT 'duckduckgo',
  auto_fallback boolean NOT NULL DEFAULT true,
  allow_auto_search boolean NOT NULL DEFAULT true,
  max_results integer NOT NULL DEFAULT 10,
  safe_search text NOT NULL DEFAULT 'moderate',
  timeout_ms integer NOT NULL DEFAULT 10000,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE search_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_search_settings" ON search_settings;
CREATE POLICY "anon_select_search_settings" ON search_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_search_settings" ON search_settings;
CREATE POLICY "anon_insert_search_settings" ON search_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_search_settings" ON search_settings;
CREATE POLICY "anon_update_search_settings" ON search_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_search_settings" ON search_settings;
CREATE POLICY "anon_delete_search_settings" ON search_settings FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS search_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  query text NOT NULL,
  search_type text NOT NULL DEFAULT 'web',
  primary_provider text NOT NULL DEFAULT 'brave',
  provider_used text NOT NULL DEFAULT 'brave',
  is_fallback boolean NOT NULL DEFAULT false,
  fallback_reason text,
  result_count integer NOT NULL DEFAULT 0,
  result_urls text[] NOT NULL DEFAULT '{}',
  cited_urls text[],
  ai_provider text,
  ai_model text,
  execution_time_ms integer,
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE search_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_search_logs" ON search_logs;
CREATE POLICY "anon_insert_search_logs" ON search_logs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authed_select_search_logs" ON search_logs;
CREATE POLICY "authed_select_search_logs" ON search_logs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authed_delete_search_logs" ON search_logs;
CREATE POLICY "authed_delete_search_logs" ON search_logs FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS search_logs_created_at_idx ON search_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS search_logs_user_id_idx ON search_logs (user_id);
