/*
# Add auth_user_id to Users Table and Profile Linking

## Changes to users table
- Add auth_user_id (uuid, references auth.users, ON DELETE CASCADE)
- Add email_normalized (text) — lowercase trimmed email
- Add login_providers (text[]) — list of providers used
- Add last_login_at (timestamptz)
- Unique partial index on auth_user_id
- Unique partial index on email_normalized for active users
- Backfill email_normalized from email

## New function
- link_or_create_user_profile: handles first-time and returning OAuth sign-in,
  verified-email linking, conflict flagging, and new profile creation.
*/

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS email_normalized text,
  ADD COLUMN IF NOT EXISTS login_providers text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- Backfill email_normalized
UPDATE public.users SET email_normalized = lower(trim(email)) WHERE email_normalized IS NULL;

-- Unique partial indexes
CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_auth_user_id
  ON public.users(auth_user_id) WHERE auth_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_email_normalized
  ON public.users(email_normalized) WHERE status = 'active' AND email_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON public.users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_users_email_normalized ON public.users(email_normalized);

-- ============================================================
-- Profile linking function
-- ============================================================
CREATE OR REPLACE FUNCTION public.link_or_create_user_profile(
  p_auth_user_id uuid,
  p_email text,
  p_name text DEFAULT NULL,
  p_provider text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_email_verified boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $_$
DECLARE
  v_user_id uuid;
  v_email_norm text;
  v_existing record;
  v_email_match record;
  v_conflict_count int;
BEGIN
  v_email_norm := lower(trim(p_email));

  -- 1. Find by auth_user_id
  SELECT id, name, email, role, status, login_providers INTO v_existing
  FROM public.users WHERE auth_user_id = p_auth_user_id LIMIT 1;

  IF FOUND THEN
    IF v_existing.status IN ('suspended', 'deleted') THEN
      PERFORM public.log_audit(
        p_action := 'auth.login_denied',
        p_entity_type := 'users',
        p_entity_id := v_existing.id,
        p_outcome := 'denied',
        p_actor_user_id := p_auth_user_id,
        p_metadata := jsonb_build_object('reason', 'account_disabled', 'status', v_existing.status)
      );
      RETURN jsonb_build_object('error', 'Account is disabled.', 'user_id', v_existing.id);
    END IF;

    UPDATE public.users
    SET last_login_at = now(),
        login_providers = ARRAY(SELECT DISTINCT unnest(login_providers || CASE WHEN p_provider IS NOT NULL THEN ARRAY[p_provider] ELSE ARRAY[]::text[] END))
    WHERE id = v_existing.id;

    PERFORM public.log_audit(
      p_action := 'auth.login',
      p_entity_type := 'users',
      p_entity_id := v_existing.id,
      p_actor_user_id := p_auth_user_id,
      p_metadata := jsonb_build_object('provider', p_provider)
    );

    RETURN jsonb_build_object('user_id', v_existing.id, 'is_new', false, 'action', 'existing');
  END IF;

  -- 2. Find by verified email
  IF p_email_verified THEN
    SELECT count(*) INTO v_conflict_count
    FROM public.users WHERE email_normalized = v_email_norm AND status = 'active';

    IF v_conflict_count = 1 THEN
      SELECT id INTO v_email_match
      FROM public.users WHERE email_normalized = v_email_norm AND status = 'active' LIMIT 1;

      UPDATE public.users
      SET auth_user_id = p_auth_user_id,
          last_login_at = now(),
          login_providers = ARRAY(SELECT DISTINCT unnest(login_providers || CASE WHEN p_provider IS NOT NULL THEN ARRAY[p_provider] ELSE ARRAY[]::text[] END)),
          oauth_provider = COALESCE(p_provider, oauth_provider),
          avatar_url = COALESCE(p_avatar_url, avatar_url)
      WHERE id = v_email_match.id;

      PERFORM public.log_audit(
        p_action := 'auth.profile_linked',
        p_entity_type := 'users',
        p_entity_id := v_email_match.id,
        p_actor_user_id := p_auth_user_id,
        p_metadata := jsonb_build_object('provider', p_provider, 'method', 'verified_email_match')
      );

      RETURN jsonb_build_object('user_id', v_email_match.id, 'is_new', false, 'action', 'linked');
    ELSIF v_conflict_count > 1 THEN
      PERFORM public.log_audit(
        p_action := 'auth.profile_conflict',
        p_entity_type := 'users',
        p_actor_user_id := p_auth_user_id,
        p_outcome := 'flagged',
        p_metadata := jsonb_build_object('email', p_email, 'conflict_count', v_conflict_count)
      );
      RETURN jsonb_build_object('error', 'Multiple profiles exist for this email. An administrator will review.', 'action', 'flagged');
    END IF;
  ELSE
    SELECT count(*) INTO v_conflict_count
    FROM public.users WHERE email_normalized = v_email_norm AND status = 'active';

    IF v_conflict_count > 0 THEN
      PERFORM public.log_audit(
        p_action := 'auth.profile_conflict',
        p_entity_type := 'users',
        p_actor_user_id := p_auth_user_id,
        p_outcome := 'flagged',
        p_metadata := jsonb_build_object('email', p_email, 'reason', 'unverified_email_existing_profile')
      );
      RETURN jsonb_build_object('error', 'An account exists for this email. Please verify your email or contact an administrator.', 'action', 'flagged');
    END IF;
  END IF;

  -- 3. Create new profile
  INSERT INTO public.users (
    name, email, email_normalized, role, status, mfa, permissions,
    auth_user_id, oauth_provider, oauth_id, avatar_url, last_active, last_login_at,
    login_providers, owner_user_id, created_by_user_id, updated_by_user_id
  ) VALUES (
    COALESCE(p_name, split_part(p_email, '@', 1)),
    p_email, v_email_norm, 'Viewer', 'active', false, '{}',
    p_auth_user_id, p_provider,
    CASE WHEN p_provider IS NOT NULL THEN p_auth_user_id::text END,
    p_avatar_url, 'Just now', now(),
    CASE WHEN p_provider IS NOT NULL THEN ARRAY[p_provider] ELSE ARRAY[]::text[] END,
    p_auth_user_id, p_auth_user_id, p_auth_user_id
  )
  RETURNING id INTO v_user_id;

  PERFORM public.log_audit(
    p_action := 'auth.profile_created',
    p_entity_type := 'users',
    p_entity_id := v_user_id,
    p_actor_user_id := p_auth_user_id,
    p_metadata := jsonb_build_object('provider', p_provider, 'email', p_email)
  );

  RETURN jsonb_build_object('user_id', v_user_id, 'is_new', true, 'action', 'created');
END;
$_$;

REVOKE EXECUTE ON FUNCTION public.link_or_create_user_profile(uuid, text, text, text, text, boolean) FROM anon;
