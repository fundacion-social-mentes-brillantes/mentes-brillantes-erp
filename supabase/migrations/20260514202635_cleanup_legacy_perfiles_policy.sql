-- Remove legacy perfiles SELECT policy left from an earlier hardening pass.
-- The active replacement is perfiles_select_secure in the main RLS migration.
DROP POLICY IF EXISTS perfiles_select_self_or_admin ON public.perfiles;
