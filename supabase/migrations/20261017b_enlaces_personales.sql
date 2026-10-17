-- Enlace personal "Mi proceso" (2026-10-17).
--
-- Cada persona puede tener un enlace privado (/p/<token>) para ver sus sesiones
-- y sus pagos sin cuenta ni contraseña. El token NO se guarda: es el id de la
-- persona y la version de su enlace, firmados con ENLACES_PERSONALES_SECRETO
-- (src/lib/enlaces-personales/token.ts). Esta tabla solo dice si el enlace esta
-- encendido y en que version va:
--   - apagarlo: activo = false;
--   - cambiarlo: version + 1 (el enlace anterior deja de funcionar).
--
-- Solo la usa el servidor (service role): RLS encendida y sin reglas, y sin
-- permisos para anon ni authenticated.

create table if not exists public.enlaces_personales (
  asistente_id uuid primary key references public.asistentes(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz not null default now(),
  ultimo_acceso timestamptz
);

comment on table public.enlaces_personales is
  'Enlace personal "Mi proceso" de cada persona: si esta encendido y su version. El token no se guarda (va firmado).';

alter table public.enlaces_personales enable row level security;
revoke all on table public.enlaces_personales from anon, authenticated;
