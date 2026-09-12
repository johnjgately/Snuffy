/*
# Revoke EXECUTE on new functions from anon

The new SECURITY DEFINER functions were created without revoking
EXECUTE from the anon role. This fixes that.
*/

REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_record(text, uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_write_record_typed(text, uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.link_or_create_user_profile(uuid, text, text, text, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.transfer_record_ownership(text, uuid, uuid, text, uuid) FROM anon;
