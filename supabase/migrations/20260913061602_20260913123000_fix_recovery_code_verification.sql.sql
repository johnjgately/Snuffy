/*
# Fix Recovery Code Verification

## Summary
Update consume_mfa_recovery_code to use SHA-256 hash comparison instead of
crypt()/bcrypt, since edge functions now hash recovery codes with SHA-256
(using Web Crypto API, not bcrypt).
*/

CREATE OR REPLACE FUNCTION consume_mfa_recovery_code(p_user_id uuid, p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record RECORD;
  v_hash text;
BEGIN
  v_hash := encode(digest(p_code, 'sha256'), 'hex');

  FOR v_record IN
    SELECT id, code_hash FROM mfa_recovery_codes
    WHERE user_id = p_user_id AND used_at IS NULL
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_record.code_hash = v_hash THEN
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
