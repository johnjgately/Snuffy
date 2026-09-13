/*
# Rate Limiting Infrastructure (retry)

## Summary
Re-applies the rate limiting infrastructure. The previous attempt failed during
view creation because the view referenced a column that doesn't exist on
rate_limit_counters. This version parses the endpoint category from bucket_key
using split_part.

## Changes — same as previous attempt, with fixed views.
*/

-- Tables may already exist from partial run; use IF NOT EXISTS
CREATE TABLE IF NOT EXISTS rate_limit_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_category text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('user', 'ip', 'organization', 'market', 'connection')),
  role_tier text NOT NULL DEFAULT 'standard' CHECK (role_tier IN ('standard', 'org_admin', 'platform_admin', 'anonymous')),
  max_requests integer NOT NULL DEFAULT 100,
  window_seconds integer NOT NULL DEFAULT 60,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(endpoint_category, scope, role_tier)
);

ALTER TABLE rate_limit_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_rate_limit_configs" ON rate_limit_configs;
CREATE POLICY "select_rate_limit_configs" ON rate_limit_configs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_rate_limit_configs" ON rate_limit_configs;
CREATE POLICY "insert_rate_limit_configs" ON rate_limit_configs
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "update_rate_limit_configs" ON rate_limit_configs;
CREATE POLICY "update_rate_limit_configs" ON rate_limit_configs
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

INSERT INTO rate_limit_configs (endpoint_category, scope, role_tier, max_requests, window_seconds) VALUES
  ('auth-signin', 'user', 'standard', 10, 60),
  ('auth-signin', 'ip', 'anonymous', 30, 60),
  ('auth-signin', 'user', 'anonymous', 5, 60),
  ('password-reset', 'user', 'standard', 3, 3600),
  ('password-reset', 'ip', 'anonymous', 10, 3600),
  ('email-verification', 'user', 'standard', 3, 3600),
  ('email-verification', 'ip', 'anonymous', 10, 3600),
  ('mfa-verify', 'user', 'standard', 5, 300),
  ('mfa-verify', 'ip', 'anonymous', 15, 300),
  ('ai-chat', 'user', 'standard', 30, 60),
  ('ai-chat', 'user', 'org_admin', 60, 60),
  ('ai-chat', 'user', 'platform_admin', 120, 60),
  ('ai-chat', 'connection', 'standard', 100, 60),
  ('web-search', 'user', 'standard', 20, 60),
  ('web-search', 'user', 'org_admin', 40, 60),
  ('web-search', 'user', 'platform_admin', 80, 60),
  ('knowledge-upload', 'user', 'standard', 10, 60),
  ('knowledge-upload', 'user', 'org_admin', 20, 60),
  ('knowledge-upload', 'user', 'platform_admin', 50, 60),
  ('export', 'user', 'standard', 5, 3600),
  ('export', 'user', 'org_admin', 10, 3600),
  ('export', 'user', 'platform_admin', 25, 3600),
  ('connector', 'user', 'standard', 20, 60),
  ('connector', 'user', 'org_admin', 40, 60),
  ('connector', 'user', 'platform_admin', 80, 60),
  ('admin', 'user', 'platform_admin', 200, 60),
  ('admin', 'user', 'org_admin', 100, 60),
  ('admin', 'user', 'standard', 20, 60)
ON CONFLICT (endpoint_category, scope, role_tier) DO NOTHING;

CREATE TABLE IF NOT EXISTS rate_limit_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_key text NOT NULL UNIQUE,
  count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  window_end timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS rate_limit_denials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_category text NOT NULL,
  scope text NOT NULL,
  identifier text NOT NULL,
  bucket_key text NOT NULL,
  limit_value integer NOT NULL,
  current_count integer NOT NULL,
  window_seconds integer NOT NULL,
  ip_address text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rate_limit_denials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_rate_limit_denials" ON rate_limit_denials;
CREATE POLICY "select_own_rate_limit_denials" ON rate_limit_denials
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_rate_limit_denials" ON rate_limit_denials;
CREATE POLICY "insert_rate_limit_denials" ON rate_limit_denials
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_rld_created ON rate_limit_denials(created_at);
CREATE INDEX IF NOT EXISTS idx_rld_endpoint ON rate_limit_denials(endpoint_category);
CREATE INDEX IF NOT EXISTS idx_rld_user ON rate_limit_denials(user_id);

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_endpoint text,
  p_scope text,
  p_identifier text,
  p_role_tier text DEFAULT 'standard',
  p_ip text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config RECORD;
  v_bucket_key text;
  v_existing RECORD;
  v_new_count integer;
  v_allowed boolean;
  v_retry_after integer;
BEGIN
  SELECT * INTO v_config FROM rate_limit_configs
  WHERE endpoint_category = p_endpoint
    AND scope = p_scope
    AND role_tier = p_role_tier
    AND enabled = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', true, 'limit', null, 'current', 0, 'retry_after', 0);
  END IF;

  v_bucket_key := p_endpoint || ':' || p_scope || ':' || p_identifier;

  SELECT * INTO v_existing FROM rate_limit_counters
  WHERE bucket_key = v_bucket_key FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO rate_limit_counters (bucket_key, count, window_start, window_end)
    VALUES (v_bucket_key, 1, now(), now() + (v_config.window_seconds || ' seconds')::interval);
    v_new_count := 1;
  ELSIF v_existing.window_end < now() THEN
    UPDATE rate_limit_counters
    SET count = 1, window_start = now(), window_end = now() + (v_config.window_seconds || ' seconds')::interval, updated_at = now()
    WHERE bucket_key = v_bucket_key;
    v_new_count := 1;
  ELSE
    v_new_count := v_existing.count + 1;
    UPDATE rate_limit_counters SET count = v_new_count, updated_at = now()
    WHERE bucket_key = v_bucket_key;
  END IF;

  v_allowed := v_new_count <= v_config.max_requests;
  v_retry_after := CASE WHEN v_allowed THEN 0 ELSE v_config.window_seconds END;

  IF NOT v_allowed THEN
    INSERT INTO rate_limit_denials (endpoint_category, scope, identifier, bucket_key, limit_value, current_count, window_seconds, ip_address, user_id)
    VALUES (p_endpoint, p_scope, p_identifier, v_bucket_key, v_config.max_requests, v_new_count, v_config.window_seconds, p_ip, p_user_id);
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'limit', v_config.max_requests,
    'current', v_new_count,
    'retry_after', v_retry_after
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_rate_limit(text, text, text, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM rate_limit_counters WHERE window_end < now() - interval '1 hour';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  DELETE FROM rate_limit_denials WHERE created_at < now() - interval '90 days';
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_expired_rate_limits() TO authenticated;

-- Views: parse endpoint from bucket_key (format: endpoint:scope:identifier)
CREATE OR REPLACE VIEW rate_limit_usage_summary AS
SELECT
  split_part(bucket_key, ':', 1) AS endpoint_category,
  split_part(bucket_key, ':', 2) AS scope,
  bucket_key,
  count,
  window_start,
  window_end,
  CASE WHEN window_end > now() THEN 'active' ELSE 'expired' END AS window_status
FROM rate_limit_counters
ORDER BY window_end DESC;

GRANT SELECT ON rate_limit_usage_summary TO authenticated;

CREATE OR REPLACE VIEW rate_limit_denial_summary AS
SELECT
  endpoint_category,
  scope,
  identifier,
  COUNT(*) AS denial_count,
  MAX(created_at) AS last_denial_at
FROM rate_limit_denials
WHERE created_at >= now() - interval '24 hours'
GROUP BY endpoint_category, scope, identifier
ORDER BY denial_count DESC;

GRANT SELECT ON rate_limit_denial_summary TO authenticated;
