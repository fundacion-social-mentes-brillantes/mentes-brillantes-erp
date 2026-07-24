begin;

create table if not exists public.mcp_oauth_artifacts (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (length(token_hash) = 64),
  token_type text not null check (token_type in ('authorization_code', 'refresh_token')),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  role text check (role is null or role in ('admin', 'caja')),
  client_id_hash text not null check (length(client_id_hash) = 64),
  client_name text,
  resource text not null,
  scope text not null default 'erp.read',
  family_id uuid,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mcp_oauth_refresh_fields check (
    token_type <> 'refresh_token'
    or (email is not null and role is not null and client_name is not null and family_id is not null)
  )
);

create index if not exists mcp_oauth_artifacts_family_idx
  on public.mcp_oauth_artifacts (family_id)
  where family_id is not null;
create index if not exists mcp_oauth_artifacts_expiry_idx
  on public.mcp_oauth_artifacts (expires_at);

alter table public.mcp_oauth_artifacts enable row level security;
alter table public.mcp_oauth_artifacts force row level security;
revoke all on table public.mcp_oauth_artifacts from public, anon, authenticated;
grant select, insert, update, delete on table public.mcp_oauth_artifacts to service_role;

comment on table public.mcp_oauth_artifacts is
  'Estado aislado del OAuth 2.1 del MCP: códigos de un uso y familias de refresh tokens revocables.';

create table if not exists public.mcp_access_audit (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  client_id_hash text not null,
  client_name text not null,
  client_kind text not null check (client_kind in ('chatgpt', 'claude', 'claude-code', 'other')),
  tool_name text not null,
  args_hash text not null check (length(args_hash) = 64),
  status text not null,
  duration_ms integer not null check (duration_ms >= 0),
  result_count integer check (result_count is null or result_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists mcp_access_audit_user_created_idx
  on public.mcp_access_audit (user_id, created_at desc);
create index if not exists mcp_access_audit_tool_created_idx
  on public.mcp_access_audit (tool_name, created_at desc);

alter table public.mcp_access_audit enable row level security;
alter table public.mcp_access_audit force row level security;
revoke all on table public.mcp_access_audit from public, anon, authenticated;
grant select, insert on table public.mcp_access_audit to service_role;
grant usage, select on sequence public.mcp_access_audit_id_seq to service_role;

comment on table public.mcp_access_audit is
  'Auditoría mínima de consultas MCP; guarda hashes de argumentos, nunca tokens ni contenidos devueltos.';

commit;
