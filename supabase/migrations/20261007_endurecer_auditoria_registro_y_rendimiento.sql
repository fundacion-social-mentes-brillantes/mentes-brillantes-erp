-- Endurecimiento y rendimiento (revision del 7 oct 2026).
--
-- 1. La auditoria financiera queda INALTERABLE: nadie (ni un admin desde la
--    app, ni el servicio) puede editar ni borrar filas. Antes un admin podia
--    borrar su propio rastro por la API.
-- 2. Tabla registro_intentos: limite de intentos del auto-registro que no se
--    pierde al reiniciarse el servidor y que cuenta por codigo de persona y por
--    IP (antes se contaba por correo+codigo+cedula y cambiando el correo se
--    podia intentar sin limite).
-- 3. search_path fijo en la funcion del trigger de telegram (aviso de seguridad
--    de Supabase).
-- 4. Indices para las 14 llaves foraneas sin indice (aviso de rendimiento).
-- 5. Politicas RLS que llamaban auth.uid()/auth.role() por cada fila ahora lo
--    hacen una sola vez por consulta ((select auth.uid())). Mismo significado.
--
-- Todo es aditivo o equivalente: no cambia ni borra datos.

begin;

-- 1. Auditoria inalterable ----------------------------------------------------

drop policy if exists auditoria_update_admin on public.auditoria_financiera;
drop policy if exists auditoria_delete_admin on public.auditoria_financiera;

create or replace function public.auditoria_es_inalterable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'La auditoria financiera no se puede modificar ni borrar.'
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists trg_auditoria_inalterable on public.auditoria_financiera;
create trigger trg_auditoria_inalterable
  before update or delete on public.auditoria_financiera
  for each row execute function public.auditoria_es_inalterable();

revoke execute on function public.auditoria_es_inalterable() from public, anon, authenticated;

-- 2. Intentos de registro ------------------------------------------------------

create table if not exists public.registro_intentos (
  id bigint generated always as identity primary key,
  clave text not null,
  creado_en timestamptz not null default now()
);

create index if not exists registro_intentos_clave_fecha_idx
  on public.registro_intentos (clave, creado_en desc);

alter table public.registro_intentos enable row level security;
-- Sin politicas a proposito: solo el servidor (service_role) la usa.
revoke all on public.registro_intentos from anon, authenticated;

comment on table public.registro_intentos is
  'Intentos de auto-registro (limite anti fuerza bruta por codigo e IP). Solo service_role.';

-- 3. search_path fijo -----------------------------------------------------------

alter function public.set_telegram_bot_sessions_updated_at() set search_path = '';

-- 4. Indices de llaves foraneas -------------------------------------------------

create index if not exists adelantos_socios_periodo_id_idx on public.adelantos_socios (periodo_id);
create index if not exists adelantos_socios_socio_id_idx on public.adelantos_socios (socio_id);
create index if not exists adelantos_socios_usuario_id_idx on public.adelantos_socios (usuario_id);
create index if not exists agenda_diferencias_resueltas_usuario_id_idx on public.agenda_diferencias_resueltas (usuario_id);
create index if not exists auditoria_financiera_usuario_id_idx on public.auditoria_financiera (usuario_id);
create index if not exists cuentas_por_cobrar_asistente_id_idx on public.cuentas_por_cobrar (asistente_id);
create index if not exists donaciones_asistentes_usuario_id_idx on public.donaciones_asistentes (usuario_id);
create index if not exists egresos_usuario_id_idx on public.egresos (usuario_id);
create index if not exists liquidaciones_socios_socio_id_idx on public.liquidaciones_socios (socio_id);
create index if not exists mcp_oauth_artifacts_user_id_idx on public.mcp_oauth_artifacts (user_id);
create index if not exists movimientos_saldo_favor_usuario_id_idx on public.movimientos_saldo_favor (usuario_id);
create index if not exists pagos_abonos_usuario_id_idx on public.pagos_abonos (usuario_id);
create index if not exists socios_usuario_id_idx on public.socios (usuario_id);
create index if not exists ventas_externas_usuario_id_idx on public.ventas_externas (usuario_id);

-- 5. RLS: auth.* una vez por consulta -------------------------------------------

drop policy if exists telegram_bot_sessions_service_role_all on public.telegram_bot_sessions;
create policy telegram_bot_sessions_service_role_all on public.telegram_bot_sessions
  for all
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists asistente_ia_conversaciones_select_own on public.asistente_ia_conversaciones;
create policy asistente_ia_conversaciones_select_own on public.asistente_ia_conversaciones
  for select
  using (
    usuario_id = (select auth.uid())
    and exists (
      select 1 from public.perfiles
      where perfiles.id = (select auth.uid()) and perfiles.rol = any (array['admin'::public.rol_usuario, 'caja'::public.rol_usuario])
    )
  );

drop policy if exists asistente_ia_conversaciones_insert_own on public.asistente_ia_conversaciones;
create policy asistente_ia_conversaciones_insert_own on public.asistente_ia_conversaciones
  for insert
  with check (
    usuario_id = (select auth.uid())
    and exists (
      select 1 from public.perfiles
      where perfiles.id = (select auth.uid()) and perfiles.rol = any (array['admin'::public.rol_usuario, 'caja'::public.rol_usuario])
    )
  );

drop policy if exists asistente_ia_conversaciones_update_own on public.asistente_ia_conversaciones;
create policy asistente_ia_conversaciones_update_own on public.asistente_ia_conversaciones
  for update
  using (
    usuario_id = (select auth.uid())
    and exists (
      select 1 from public.perfiles
      where perfiles.id = (select auth.uid()) and perfiles.rol = any (array['admin'::public.rol_usuario, 'caja'::public.rol_usuario])
    )
  )
  with check (
    usuario_id = (select auth.uid())
    and exists (
      select 1 from public.perfiles
      where perfiles.id = (select auth.uid()) and perfiles.rol = any (array['admin'::public.rol_usuario, 'caja'::public.rol_usuario])
    )
  );

drop policy if exists asistente_ia_conversaciones_delete_own on public.asistente_ia_conversaciones;
create policy asistente_ia_conversaciones_delete_own on public.asistente_ia_conversaciones
  for delete
  using (
    usuario_id = (select auth.uid())
    and exists (
      select 1 from public.perfiles
      where perfiles.id = (select auth.uid()) and perfiles.rol = any (array['admin'::public.rol_usuario, 'caja'::public.rol_usuario])
    )
  );

drop policy if exists asistente_ia_mensajes_select_own on public.asistente_ia_mensajes;
create policy asistente_ia_mensajes_select_own on public.asistente_ia_mensajes
  for select
  using (
    exists (
      select 1
      from public.asistente_ia_conversaciones c
      join public.perfiles p on p.id = (select auth.uid())
      where c.id = asistente_ia_mensajes.conversacion_id
        and c.usuario_id = (select auth.uid())
        and p.rol = any (array['admin'::public.rol_usuario, 'caja'::public.rol_usuario])
    )
  );

drop policy if exists asistente_ia_mensajes_insert_own on public.asistente_ia_mensajes;
create policy asistente_ia_mensajes_insert_own on public.asistente_ia_mensajes
  for insert
  with check (
    exists (
      select 1
      from public.asistente_ia_conversaciones c
      join public.perfiles p on p.id = (select auth.uid())
      where c.id = asistente_ia_mensajes.conversacion_id
        and c.usuario_id = (select auth.uid())
        and p.rol = any (array['admin'::public.rol_usuario, 'caja'::public.rol_usuario])
    )
  );

drop policy if exists asistente_ia_mensajes_delete_own on public.asistente_ia_mensajes;
create policy asistente_ia_mensajes_delete_own on public.asistente_ia_mensajes
  for delete
  using (
    exists (
      select 1
      from public.asistente_ia_conversaciones c
      join public.perfiles p on p.id = (select auth.uid())
      where c.id = asistente_ia_mensajes.conversacion_id
        and c.usuario_id = (select auth.uid())
        and p.rol = any (array['admin'::public.rol_usuario, 'caja'::public.rol_usuario])
    )
  );

drop policy if exists perfiles_select_secure on public.perfiles;
create policy perfiles_select_secure on public.perfiles
  for select
  using (public.mb_is_admin() or id = (select auth.uid()));

drop policy if exists pagos_delete_admin_recent_caja on public.pagos_abonos;
create policy pagos_delete_admin_recent_caja on public.pagos_abonos
  for delete
  using (
    public.mb_is_admin()
    or (
      public.mb_current_role() = 'caja'::public.rol_usuario
      and usuario_id = (select auth.uid())
      and creado_en > (now() - interval '15 minutes')
    )
  );

drop policy if exists saldo_delete_admin_recent_caja on public.movimientos_saldo_favor;
create policy saldo_delete_admin_recent_caja on public.movimientos_saldo_favor
  for delete
  using (
    public.mb_is_admin()
    or (
      public.mb_current_role() = 'caja'::public.rol_usuario
      and usuario_id = (select auth.uid())
      and creado_en > (now() - interval '15 minutes')
    )
  );

commit;
