-- Registro de operaciones de ESCRITURA solicitadas desde el MCP.
--
-- Cada operacion nace como borrador ("emitido"). Solo se ejecuta cuando el
-- usuario confirma, y el paso a "ejecutando" es atomico (UPDATE condicional):
-- eso hace imposible que un mismo permiso escriba dos veces, aunque el cliente
-- reintente o mande la confirmacion duplicada.
--
-- Tambien guarda la huella de la operacion para poder avisar de posibles
-- duplicados (p. ej. la misma foto de pago enviada dos veces).

create table if not exists public.mcp_operaciones (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  operacion text not null,
  huella text not null check (length(huella) = 64),
  resumen text not null,
  params jsonb not null,
  estado text not null default 'emitido'
    check (estado in ('emitido', 'ejecutando', 'ejecutado', 'fallido', 'cancelado')),
  resultado jsonb,
  error text,
  expira_en timestamptz not null,
  creado_en timestamptz not null default now(),
  ejecutado_en timestamptz
);

alter table public.mcp_operaciones enable row level security;

-- Sin policies a proposito: solo service_role (que hace bypass de RLS) puede
-- tocar esta tabla. Ningun usuario final la lee ni la escribe.
revoke all on public.mcp_operaciones from anon;
revoke all on public.mcp_operaciones from authenticated;

create index if not exists idx_mcp_operaciones_huella
  on public.mcp_operaciones (user_id, huella, creado_en desc);

create index if not exists idx_mcp_operaciones_estado
  on public.mcp_operaciones (estado, creado_en desc);
