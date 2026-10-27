-- Talleres (2026-10-27).
--
-- Cada taller, encuentro, retiro o evento especial lleva sus cuentas aparte:
-- quien se inscribio, cuanto debe pagar, cuanto pago, si vino y sus gastos.
--
-- La plata NO tiene tablas nuevas, para no tocar la liquidacion:
--   - cada pago de un inscrito es una venta externa (ventas_externas) con
--     taller_inscripcion_id; asi entra sola a los ingresos del periodo, al
--     resumen por metodo de pago y a la liquidacion de socios;
--   - cada gasto del taller es un egreso (egresos) con taller_id.
--
-- Los inscritos NO son asistentes: una persona nueva no recibe codigo ni ficha
-- por venir a un taller. Si ya es asistente, la inscripcion se enlaza a su
-- ficha (asistente_id) para que alli se vea a que talleres fue y que pago.
--
-- Permisos (mismo patron del resto): leer admin/caja; los talleres los crea y
-- cambia el admin; las inscripciones las manejan admin y caja (caja marca la
-- llegada el dia del taller); borrar, solo admin. Nada para anon.
-- La pagina publica de invitaciones NO entra directo: usa la API del ERP con
-- una clave compartida, del lado del servidor (/api/integraciones/talleres).

create table if not exists public.talleres (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) > 0),
  -- Parte final del enlace de invitacion: talleres.gimnasioemocionalmb.com/<slug>
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  tipo text not null default 'taller' check (length(btrim(tipo)) > 0),
  descripcion text,
  fecha_inicio timestamptz,
  lugar text,
  precio numeric(12,2) not null default 0 check (precio >= 0),
  cupo integer check (cupo is null or cupo > 0),
  estado text not null default 'borrador'
    check (estado in ('borrador', 'abierto', 'cerrado', 'realizado', 'cancelado')),
  instrucciones_pago text,
  -- Preguntas propias del formulario: [{ id, texto, tipo: 'texto'|'opciones'|'si_no', opciones?, obligatoria }]
  preguntas jsonb not null default '[]'::jsonb check (jsonb_typeof(preguntas) = 'array'),
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz not null default now()
);

comment on table public.talleres is
  'Talleres, encuentros y eventos con inscripcion. Sus pagos son ventas_externas (taller_inscripcion_id) y sus gastos egresos (taller_id).';

create table if not exists public.taller_inscripciones (
  id uuid primary key default gen_random_uuid(),
  taller_id uuid not null references public.talleres(id) on delete restrict,
  nombre text not null check (length(btrim(nombre)) > 0),
  -- Cedula solo con digitos (asi se reconoce a quien ya es asistente).
  documento text check (documento is null or documento ~ '^[0-9A-Za-z]{3,20}$'),
  telefono text,
  correo text,
  respuestas jsonb not null default '{}'::jsonb check (jsonb_typeof(respuestas) = 'object'),
  -- Lo que esta persona debe pagar (el precio, o menos si hubo descuento o cortesia).
  valor_acordado numeric(12,2) not null default 0 check (valor_acordado >= 0),
  estado text not null default 'inscrito' check (estado in ('inscrito', 'cancelado')),
  asistio boolean not null default false,
  hora_llegada timestamptz,
  origen text not null default 'manual' check (origen in ('manual', 'invitacion', 'puerta')),
  autorizo_datos_en timestamptz,
  -- Solo si la persona YA es asistente del ERP: enlaza el taller a su ficha
  -- (como registro aparte, sin sumar a su deuda). Inscribirse no crea asistentes.
  asistente_id uuid references public.asistentes(id) on delete set null,
  comprobante_ruta text,
  comprobante_en timestamptz,
  -- Codigo de la boleta: lo que lleva el enlace que recibe la persona. No es secuencial.
  codigo_boleta text not null unique default replace(gen_random_uuid()::text, '-', ''),
  notas text,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz not null default now()
);

comment on table public.taller_inscripciones is
  'Personas inscritas a un taller. No son asistentes (no reciben codigo ni ficha); lo pagado sale de ventas_externas.';

create index if not exists idx_taller_inscripciones_taller on public.taller_inscripciones (taller_id);
create index if not exists idx_taller_inscripciones_documento on public.taller_inscripciones (documento) where documento is not null;
create index if not exists idx_taller_inscripciones_asistente on public.taller_inscripciones (asistente_id) where asistente_id is not null;
-- Una misma cedula no se inscribe dos veces al mismo taller (salvo que se haya cancelado).
create unique index if not exists uq_taller_inscripciones_documento
  on public.taller_inscripciones (taller_id, documento)
  where documento is not null and estado <> 'cancelado';

-- Pagos y gastos marcados con su taller.
alter table public.ventas_externas
  add column if not exists taller_inscripcion_id uuid references public.taller_inscripciones(id) on delete restrict;
create index if not exists idx_ventas_externas_taller_inscripcion
  on public.ventas_externas (taller_inscripcion_id) where taller_inscripcion_id is not null;

alter table public.egresos
  add column if not exists taller_id uuid references public.talleres(id) on delete restrict;
create index if not exists idx_egresos_taller on public.egresos (taller_id) where taller_id is not null;

-- Seguridad
alter table public.talleres enable row level security;
alter table public.taller_inscripciones enable row level security;
revoke all on table public.talleres from anon;
revoke all on table public.taller_inscripciones from anon;

drop policy if exists talleres_select_admin_caja on public.talleres;
create policy talleres_select_admin_caja on public.talleres
  for select using (public.mb_is_admin_or_caja());
drop policy if exists talleres_insert_admin on public.talleres;
create policy talleres_insert_admin on public.talleres
  for insert with check (public.mb_is_admin());
drop policy if exists talleres_update_admin on public.talleres;
create policy talleres_update_admin on public.talleres
  for update using (public.mb_is_admin()) with check (public.mb_is_admin());
drop policy if exists talleres_delete_admin on public.talleres;
create policy talleres_delete_admin on public.talleres
  for delete using (public.mb_is_admin());

drop policy if exists taller_inscripciones_select_admin_caja on public.taller_inscripciones;
create policy taller_inscripciones_select_admin_caja on public.taller_inscripciones
  for select using (public.mb_is_admin_or_caja());
drop policy if exists taller_inscripciones_insert_admin_caja on public.taller_inscripciones;
create policy taller_inscripciones_insert_admin_caja on public.taller_inscripciones
  for insert with check (public.mb_is_admin_or_caja());
drop policy if exists taller_inscripciones_update_admin_caja on public.taller_inscripciones;
create policy taller_inscripciones_update_admin_caja on public.taller_inscripciones
  for update using (public.mb_is_admin_or_caja()) with check (public.mb_is_admin_or_caja());
drop policy if exists taller_inscripciones_delete_admin on public.taller_inscripciones;
create policy taller_inscripciones_delete_admin on public.taller_inscripciones
  for delete using (public.mb_is_admin());

-- Comprobantes de pago que sube la gente desde la invitacion: privados.
-- Sin reglas en storage.objects para este bucket: solo el servidor (service role) los lee.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'talleres-comprobantes',
  'talleres-comprobantes',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;
