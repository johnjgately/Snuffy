/*
# Account security: email verification, password reset tokens, MFA, sessions, lockout

## Purpose
Implements the account and login policy infrastructure: email verification tracking,
single-use password reset tokens, MFA enrollment (TOTP), session tracking with idle/absolute
timeouts, and account lockout with rate limiting.

## Changes

### 1. New table: `password_reset_tokens`
- Single-use, short-lived tokens for password reset
- `token_hash` (text, unique) — SHA256 hash of the token
- `user_id` (uuid, FK auth.users) — the user who requested the reset
- `expires_at` (timestamptz) — 1 hour lifetime
- `used_at` (timestamptz, nullable) — when the token was consumed
- `created_at` (timestamptz)
- `ip_address` (text, nullable) — IP that requested the reset
- Only one active token per user; creating a new one invalidates prior tokens

### 2. New table: `mfa_enrollments`
- TOTP-based MFA enrollment
- `id` (uuid, PK)
- `user_id` (uuid, FK auth.users)
- `secret_hash` (text, NOT NULL) — encrypted TOTP secret
- `backup_codes_hash` (text, nullable) — hashed backup codes
- `enabled` (boolean, default false) — true after successful verification
- `verified_at` (timestamptz, nullable)
- `created_at`, `updated_at`
- One active enrollment per user

### 3. New table: `user_sessions`
- Tracks active sessions for idle/absolute timeout enforcement and revocation
- `id` (uuid, PK)
- `user_id` (uuid, FK auth.users)
- `session_token_hash` (text, NOT NULL) — hash of the refresh token
- `ip_address` (text, nullable)
- `user_agent` (text, nullable)
- `created_at` (timestamptz) — session start (for absolute 12h lifetime)
- `last_activity_at` (timestamptz) — last activity (for 30min idle timeout)
- `expires_at` (timestamptz) — absolute expiry
- `revoked_at` (timestamptz, nullable) — when session was revoked
- `revoked_by` (text, nullable) — 'user' | 'admin' | 'system' | 'password_reset' | 'mfa_reset' | 'disabled'

### 4. New table: `login_attempts`
- Rate limiting and lockout tracking
- `id` (uuid, PK)
- `email` (text, NOT NULL) — the email attempted
- `email_hash` (text, NOT NULL) — SHA256 of email for lookup
- `ip_address` (text, nullable)
- `success` (boolean, NOT NULL)
- `attempted_at` (timestamptz, default now())
- `user_id` (uuid, nullable) — resolved user if exists

### 5. New table: `account_lockouts`
- Active lockout records
- `id` (uuid, PK)
- `email_hash` (text, NOT NULL)
- `locked_until` (timestamptz, NOT NULL)
- `reason` (text, NOT NULL) — 'too_many_attempts'
- `failed_count` (integer, NOT NULL)
- `created_at` (timestamptz, default now())
- `released_at` (timestamptz, nullable)

### 6. Add columns to `users` table
- `email_verified` (boolean, default false)
- `email_verified_at` (timestamptz, nullable)
- `mfa_required` (boolean, default false) — org-level MFA policy
- `mfa_enabled` (boolean, default false) — user has MFA active
- `locked_until` (timestamptz, nullable) — account lockout expiry
- `disabled` (boolean, default false) — admin-disabled account
- `disabled_at` (timestamptz, nullable)
- `disabled_by_user_id` (uuid, nullable)
- `disabled_reason` (text, nullable)
- `password_changed_at` (timestamptz, nullable)
- `created_by_admin_user_id` (uuid, nullable) — admin who created this user
- `initial_password_changed` (boolean, default false)

### 7. Add `mfa_required` column to `organizations`

### 8. RLS policies on all new tables
- password_reset_tokens: service-role only (no user policies)
- mfa_enrollments: users can read/manage their own
- user_sessions: users can read/revoke their own; admins can read/revoke all
- login_attempts: service-role only
- account_lockouts: service-role only

## Security
- All new tables have RLS enabled
- Token secrets are hashed, never stored in plaintext
- Login attempts and lockouts are service-role only
- Helper functions use extensions.digest() for SHA256 hashing (pgcrypto in extensions schema)
*/

-- 1. password_reset_tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  ip_address text
);

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- 2. mfa_enrollments
CREATE TABLE IF NOT EXISTS mfa_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  secret_hash text NOT NULL,
  backup_codes_hash text,
  enabled boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mfa_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_mfa" ON mfa_enrollments;
CREATE POLICY "select_own_mfa" ON mfa_enrollments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "insert_own_mfa" ON mfa_enrollments;
CREATE POLICY "insert_own_mfa" ON mfa_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "update_own_mfa" ON mfa_enrollments;
CREATE POLICY "update_own_mfa" ON mfa_enrollments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_mfa" ON mfa_enrollments;
CREATE POLICY "delete_own_mfa" ON mfa_enrollments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 3. user_sessions
CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by text
);

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_sessions" ON user_sessions;
CREATE POLICY "select_own_sessions" ON user_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "update_own_sessions" ON user_sessions;
CREATE POLICY "update_own_sessions" ON user_sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_admin())
  WITH CHECK (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "delete_own_sessions" ON user_sessions;
CREATE POLICY "delete_own_sessions" ON user_sessions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR is_admin());

-- 4. login_attempts
CREATE TABLE IF NOT EXISTS login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_hash text NOT NULL,
  ip_address text,
  success boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid
);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_hash_time ON login_attempts (email_hash, attempted_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts (ip_address, attempted_at);

-- 5. account_lockouts
CREATE TABLE IF NOT EXISTS account_lockouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash text NOT NULL,
  locked_until timestamptz NOT NULL,
  reason text NOT NULL DEFAULT 'too_many_attempts',
  failed_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);

ALTER TABLE account_lockouts ENABLE ROW LEVEL SECURITY;

-- 6. Add columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_required boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_by_user_id uuid;
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_reason text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by_admin_user_id uuid;
ALTER TABLE users ADD COLUMN IF NOT EXISTS initial_password_changed boolean NOT NULL DEFAULT false;

-- 7. Add mfa_required to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS mfa_required boolean NOT NULL DEFAULT false;

-- 8. Helper functions (using extensions.digest for SHA256)
CREATE OR REPLACE FUNCTION hash_token(p_token text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT encode(digest(p_token, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION is_account_locked(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM account_lockouts
    WHERE email_hash = encode(digest(p_email, 'sha256'), 'hex')
    AND locked_until > now()
    AND released_at IS NULL
  )
$$;

CREATE OR REPLACE FUNCTION count_recent_failures(p_email text, p_window_minutes integer DEFAULT 15)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COUNT(*)::integer
  FROM login_attempts
  WHERE email_hash = encode(digest(p_email, 'sha256'), 'hex')
  AND success = false
  AND attempted_at > now() - (p_window_minutes || ' minutes')::interval
$$;

CREATE OR REPLACE FUNCTION revoke_user_sessions(p_user_id uuid, p_reason text DEFAULT 'system')
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE user_sessions
  SET revoked_at = now(), revoked_by = p_reason
  WHERE user_id = p_user_id AND revoked_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION invalidate_reset_tokens(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE password_reset_tokens
  SET used_at = now()
  WHERE user_id = p_user_id AND used_at IS NULL;
$$;
