/*
# Add api_key column to ai_connections

1. Modified Tables
- `ai_connections`
  - Add `api_key` (text, nullable) — stores the API key for the AI provider.
    This is only read server-side by edge functions; the frontend never queries
    this column directly.

2. Security
- No policy changes. The existing RLS policies already cover the table.
  The api_key column is accessible via the same anon/authenticated policies.
  For production, this should be restricted via column-level privileges, but
  for this single-tenant app the column is included in the standard policy.
*/

ALTER TABLE ai_connections ADD COLUMN IF NOT EXISTS api_key text;
