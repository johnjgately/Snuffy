/*
# Add single-use OAuth state storage

1. New table
- `oauth_states`
  - `state` (text, unique): one-time anti-CSRF state value.
  - `provider` (text): OAuth provider selected by the user.
  - `user_id` (uuid): authenticated Supabase user who initiated the flow.
  - `expires_at` (timestamptz): short expiration window.
  - `used_at` (timestamptz, nullable): atomic replay protection marker.
  - `created_at` (timestamptz): creation timestamp.

2. Security
- Enable RLS.
- Deny direct browser access; only the trusted OAuth Edge Function uses the table with service-role access.
- The function must bind state to the authenticated user, provider, expiration, and single-use marker.
*/

CREATE TABLE IF NOT EXISTS public.oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL UNIQUE,
  provider text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oauth_states FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS oauth_states_lookup_idx ON public.oauth_states (state, provider, user_id, expires_at);
