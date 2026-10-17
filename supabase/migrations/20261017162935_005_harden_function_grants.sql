-- 005 Harden function grants flagged by the security advisor.
-- rls_auto_enable() is an internal helper; it must not be callable through the REST API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Future functions in public are not executable by anon/public unless explicitly granted.
alter default privileges in schema public revoke execute on functions from public, anon;
