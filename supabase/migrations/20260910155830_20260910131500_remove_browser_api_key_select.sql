/*
# Remove browser access to AI provider API keys

1. Modified table
- `ai_connections`: replace the table-wide SELECT grant for authenticated users with an explicit allowlist of safe display and usage columns.

2. Security
- `authenticated` can no longer select `api_key` through the Supabase Data API.
- The trusted AI proxy continues to read the key using the service role after it verifies the connection owner.
- Insert and update access remains available for the connection form; the key is accepted only as a write input and is never returned in browser reads.
*/

REVOKE SELECT ON public.ai_connections FROM authenticated;
GRANT SELECT (id, name, kind, provider, endpoint, models, enabled, status, usage_tokens, usage_cost, key_masked, created_at, user_id) ON public.ai_connections TO authenticated;
REVOKE SELECT (api_key) ON public.ai_connections FROM anon, authenticated;
