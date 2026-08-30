/*
# Add increment_ai_usage function

1. New Functions
- `increment_ai_usage(conn_id uuid, token_count integer)` — SECURITY DEFINER function
  that increments the usage_tokens column for a given AI connection. This allows
  the edge function to update usage stats without needing full UPDATE permissions.

2. Security
- SECURITY DEFINER so the edge function (using service role) can update usage stats.
- No policy changes needed.
*/

CREATE OR REPLACE FUNCTION increment_ai_usage(conn_id uuid, token_count integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE ai_connections
  SET usage_tokens = usage_tokens + COALESCE(token_count, 0)
  WHERE id = conn_id;
END;
$$;
