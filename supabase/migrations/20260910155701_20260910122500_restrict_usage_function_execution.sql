/*
# Restrict AI usage counter execution

1. Modified function
- `increment_ai_usage(uuid, integer)` remains available to trusted server-side code.

2. Security
- Revoke direct execution from anonymous and authenticated browser roles.
- The AI proxy Edge Function uses the service role and remains able to update usage counters after it has authorized the connection owner.
*/

REVOKE EXECUTE ON FUNCTION public.increment_ai_usage(uuid, integer) FROM anon, authenticated;
