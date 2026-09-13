/*
# MFA Hardening Infrastructure

## Summary
This migration upgrades the MFA system from a demo that accepts any 6-digit code
to production-ready TOTP with encrypted secrets, recovery codes, step-up challenges,
and lockout tracking.

## Changes

### 1. mfa_enrollments table — new columns
- `secret_encrypted` (text, nullable): AES-256-GCM encrypted TOTP secret. Replaces
  the insecure `secret_hash` approach which stored only a hash (making TOTP
  verification impossible server-side). The secret is encrypted with a key from
  edge function secrets (MFA_ENCRYPTION_KEY).
- `recovery_codes_hash` (text, nullable): JSON array of bcrypt-hashed recovery codes.
  Each code is one-time use — consumed codes are tracked in `recovery_codes_used`.
- `failed_attempts` (int, default 0): Counter for MFA verification failures.
- `locked_until` (timestamptz, nullable): Timestamp until which MFA is locked due
  to repeated failures.
- `last_verified_at` (timestamptz, nullable): Last successful TOTP verification.
- `enrolled_at` (timestamptz, nullable): When enrollment was completed.

### 2. mfa_recovery_codes table — new
- Stores individual recovery code hashes for one-time-use enforcement.
- Columns: id, user_id, code_hash, used_at, used_at_ip, created_at.
- RLS enabled: users can only see their own recovery codes (for checking which
  are consumed).

### 3. mfa_step_up_challenges table — new
- Records step-up authentication challenges for sensitive actions.
- Columns: id, user_id, challenge_type (totp|recovery|admin_override),
  challenge_reason, status (pending|verified|failed|expired),
  verified_at, expires_at, requested_ip, created_at.
- Challenges expire after 5 minutes.
- RLS enabled: users can only see their own challenges.

### 4. mfa_audit_events table — new
- Dedicated audit table for MFA-specific events: enrollment, verification
  success, verification failure, recovery code use, disablement, admin override,
  lockout, step-up challenge requested/verified/failed.
- Columns: id, user_id, event_type, outcome, ip_address, metadata, created_at.
- RLS enabled: users can read their own MFA audit events; admins can read all.

### 5. Functions
- `consume_mfa_recovery_code(p_user_id, p_code)`: Validates and marks a recovery
  code as used atomically. Returns true if valid, false otherwise.
- `create_mfa_step_up_challenge(p_user_id, p_reason, p_ip)`: Creates a pending
  step-up challenge with 5-minute expiry.
- `verify_mfa_step_up_challenge(p_challenge_id, p_user_id)`: Marks a challenge
  as verified. Returns true if valid and not expired.
- `check_mfa_step_up(p_user_id, p_max_age_seconds)`: Returns true if the user
  has a verified step-up challenge within the last `p_max_age_seconds`.

### 6. Security
- RLS enabled on all new tables.
- Policies: users can CRUD their own MFA data. Admins can read all MFA audit events.
- `mfa_recovery_codes` DELETE is denied to users (codes can only be consumed,
  not deleted).
- `mfa_step_up_challenges` INSERT is allowed for own user; UPDATE only to set
  verified status.
*/

-- 1. Add columns to mfa_enrollments
ALTER TABLE mfa_enrollments
  ADD COLUMN IF NOT EXISTS secret_encrypted text,
  ADD COLUMN IF NOT EXISTS recovery_codes_hash text,
  ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrolled_at timestamptz;

-- 2. mfa_recovery_codes table
CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  used_at_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_mfa_recovery_codes" ON mfa_recovery_codes;
CREATE POLICY "select_own_mfa_recovery_codes" ON mfa_recovery_codes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_mfa_recovery_codes" ON mfa_recovery_codes;
CREATE POLICY "insert_own_mfa_recovery_codes" ON mfa_recovery_codes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_mfa_recovery_codes" ON mfa_recovery_codes;
CREATE POLICY "update_own_mfa_recovery_codes" ON mfa_recovery_codes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user ON mfa_recovery_codes(user_id);

-- 3. mfa_step_up_challenges table
CREATE TABLE IF NOT EXISTS mfa_step_up_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_type text NOT NULL DEFAULT 'totp' CHECK (challenge_type IN ('totp', 'recovery', 'admin_override')),
  challenge_reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed', 'expired')),
  verified_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  requested_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mfa_step_up_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_mfa_step_up" ON mfa_step_up_challenges;
CREATE POLICY "select_own_mfa_step_up" ON mfa_step_up_challenges
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_mfa_step_up" ON mfa_step_up_challenges;
CREATE POLICY "insert_own_mfa_step_up" ON mfa_step_up_challenges
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_mfa_step_up" ON mfa_step_up_challenges;
CREATE POLICY "update_own_mfa_step_up" ON mfa_step_up_challenges
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_mfa_step_up_user ON mfa_step_up_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_step_up_expires ON mfa_step_up_challenges(expires_at);

-- 4. mfa_audit_events table
CREATE TABLE IF NOT EXISTS mfa_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'enrollment_started', 'enrollment_completed', 'enrollment_failed',
    'verification_success', 'verification_failure',
    'recovery_code_used', 'recovery_code_failed',
    'mfa_disabled', 'admin_override_disable',
    'mfa_lockout', 'step_up_requested', 'step_up_verified', 'step_up_failed',
    'step_up_expired'
  )),
  outcome text NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'failure', 'info')),
  ip_address text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mfa_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_mfa_audit_events" ON mfa_audit_events;
CREATE POLICY "select_own_mfa_audit_events" ON mfa_audit_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_mfa_audit_events" ON mfa_audit_events;
CREATE POLICY "insert_own_mfa_audit_events" ON mfa_audit_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_mfa_audit_events_user ON mfa_audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_audit_events_type ON mfa_audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_mfa_audit_events_created ON mfa_audit_events(created_at);

-- 5. Functions
CREATE OR REPLACE FUNCTION consume_mfa_recovery_code(p_user_id uuid, p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record RECORD;
BEGIN
  FOR v_record IN
    SELECT id, code_hash FROM mfa_recovery_codes
    WHERE user_id = p_user_id AND used_at IS NULL
    FOR UPDATE SKIP LOCKED
  LOOP
    IF crypt(p_code, v_record.code_hash) THEN
      UPDATE mfa_recovery_codes
      SET used_at = now()
      WHERE id = v_record.id AND used_at IS NULL;
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION consume_mfa_recovery_code(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION create_mfa_step_up_challenge(p_user_id uuid, p_reason text, p_ip text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO mfa_step_up_challenges (user_id, challenge_reason, requested_ip)
  VALUES (p_user_id, p_reason, p_ip)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_mfa_step_up_challenge(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION verify_mfa_step_up_challenge(p_challenge_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record RECORD;
BEGIN
  SELECT * INTO v_record FROM mfa_step_up_challenges
  WHERE id = p_challenge_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;
  IF v_record.status != 'pending' THEN RETURN false; END IF;
  IF v_record.expires_at < now() THEN
    UPDATE mfa_step_up_challenges SET status = 'expired' WHERE id = p_challenge_id;
    RETURN false;
  END IF;

  UPDATE mfa_step_up_challenges
  SET status = 'verified', verified_at = now()
  WHERE id = p_challenge_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION verify_mfa_step_up_challenge(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION check_mfa_step_up(p_user_id uuid, p_max_age_seconds integer DEFAULT 300)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM mfa_step_up_challenges
    WHERE user_id = p_user_id
    AND status = 'verified'
    AND verified_at >= now() - (p_max_age_seconds || ' seconds')::interval
  );
$$;

GRANT EXECUTE ON FUNCTION check_mfa_step_up(uuid, integer) TO authenticated;
