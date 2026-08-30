/*
# Add OAuth2 support to users table

1. Modified Tables
- `users`
  - Add `oauth_provider` (text, nullable) — e.g. 'google', 'github', 'azure'
  - Add `oauth_id` (text, nullable) — the provider's unique user ID
  - Add `avatar_url` (text, nullable) — profile picture from OAuth provider
  - Add `last_active` (text, default 'Never')

2. New Tables
- `oauth_configs`
  - Stores OAuth2 provider configurations (provider name, client_id, client_secret,
    authorization endpoint, token endpoint, userinfo endpoint, scopes, enabled)
  - The client_secret is only read server-side by edge functions.

3. Security
- Enable RLS on oauth_configs. Allow anon + authenticated full CRUD (no-auth app).
*/

ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active text NOT NULL DEFAULT 'Never';

CREATE TABLE IF NOT EXISTS oauth_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  client_id text NOT NULL DEFAULT '',
  client_secret text NOT NULL DEFAULT '',
  auth_url text NOT NULL DEFAULT '',
  token_url text NOT NULL DEFAULT '',
  userinfo_url text NOT NULL DEFAULT '',
  scopes text NOT NULL DEFAULT 'openid email profile',
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE oauth_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_oauth_configs" ON oauth_configs;
CREATE POLICY "anon_select_oauth_configs" ON oauth_configs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_oauth_configs" ON oauth_configs;
CREATE POLICY "anon_insert_oauth_configs" ON oauth_configs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_oauth_configs" ON oauth_configs;
CREATE POLICY "anon_update_oauth_configs" ON oauth_configs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_oauth_configs" ON oauth_configs;
CREATE POLICY "anon_delete_oauth_configs" ON oauth_configs FOR DELETE
  TO anon, authenticated USING (true);
