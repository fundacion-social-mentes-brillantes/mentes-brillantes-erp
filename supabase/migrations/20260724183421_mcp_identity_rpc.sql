-- Resuelve la identidad MCP dentro de Postgres para evitar depender de
-- Auth Admin durante cada canje o llamada. Solo service_role puede ejecutarla.
create or replace function public.mcp_resolve_identity(p_user_id uuid)
returns table (
  user_id uuid,
  email text,
  role text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    users.id as user_id,
    coalesce(users.email, '')::text as email,
    profiles.rol::text as role
  from auth.users as users
  inner join public.perfiles as profiles on profiles.id = users.id
  where users.id = p_user_id
    and users.deleted_at is null
    and (users.banned_until is null or users.banned_until <= now())
    and profiles.rol::text in ('admin', 'caja')
  limit 1;
$$;

revoke all on function public.mcp_resolve_identity(uuid) from public;
revoke all on function public.mcp_resolve_identity(uuid) from anon;
revoke all on function public.mcp_resolve_identity(uuid) from authenticated;
grant execute on function public.mcp_resolve_identity(uuid) to service_role;
