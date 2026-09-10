/*
# Restrict execution of SECURITY DEFINER helper functions

The RBAC helper functions (app_role, is_admin, is_manager_of, can_read_record,
can_write_record, current_user_id, set_updated_at, set_ownership_on_insert,
set_updated_by_on_update) are SECURITY DEFINER and were executable by the anon
role by default. Revoke EXECUTE from anon and public, grant only to authenticated.
*/

REVOKE EXECUTE ON FUNCTION public.app_role(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_manager_of(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_read_record(text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_write_record(text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_user_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_ownership_on_insert() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_by_on_update() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.app_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_record(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_record(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_id() TO authenticated;
