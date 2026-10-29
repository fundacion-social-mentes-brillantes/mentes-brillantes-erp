-- Cuentas de dinero y traslados entre cuentas (2026-10-29).
--
-- 1. Banco Caja Social: la fundacion volvio a tener cuenta alli. Se suma al tipo
--    metodo_pago (solo se agrega; nada de lo que existe cambia).
--
-- 2. medios_pago: la lista de cuentas con el NOMBRE que ve la gente. Cada pago
--    sigue guardando su clave tecnica (efectivo, nequi, banco_caja_social...),
--    asi que cambiarle el nombre a una cuenta no toca ningun registro viejo.
--    Sebastian pidio poder renombrar, agregar y ocultar cuentas "sin que se dane
--    nada":
--      - renombrar u ocultar: update de nombre/activo/orden (solo admin);
--      - agregar: fn_crear_medio_pago(nombre), que crea la clave y la suma al tipo;
--      - nunca se borra una cuenta: los pagos viejos la siguen nombrando.
--    saldo_a_favor no es una cuenta de dinero (lo pone el sistema) y no va en la lista.
--
-- 3. traslados_cuentas: plata que pasa de una cuenta de la fundacion a otra (por
--    ejemplo, de Nequi al Banco Caja Social). No es ingreso ni gasto: no cambia
--    la utilidad ni la liquidacion de los socios; solo mueve el saldo de cada
--    cuenta en el resumen por cuenta. Los registra el admin; no se borran, se anulan.
--
-- 4. El cierre de la liquidacion tenia escrita a mano la lista de metodos
--    ('efectivo','nequi','daviplata','otro'): un pago por una cuenta nueva no
--    habria entrado a los ingresos del cierre. Ahora toma todas las cuentas del
--    tipo metodo_pago (menos saldo_a_favor) y suma los traslados aparte.

-- 1 ------------------------------------------------------------------------
alter type public.metodo_pago add value if not exists 'banco_caja_social';

-- 2 ------------------------------------------------------------------------
create table if not exists public.medios_pago (
  clave text primary key check (clave ~ '^[a-z0-9_]{2,60}$' and clave <> 'saldo_a_favor'),
  nombre text not null check (length(btrim(nombre)) between 2 and 60),
  activo boolean not null default true,
  orden integer not null default 100,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index if not exists medios_pago_nombre_unico on public.medios_pago (lower(btrim(nombre)));

insert into public.medios_pago (clave, nombre, activo, orden) values
  ('efectivo', 'Efectivo', true, 10),
  ('nequi', 'Nequi', true, 20),
  ('daviplata', 'Daviplata', true, 30),
  ('banco_caja_social', 'Banco Caja Social', true, 40),
  ('otro', 'Otro', true, 90)
on conflict (clave) do nothing;

alter table public.medios_pago enable row level security;
revoke all on table public.medios_pago from anon;
revoke insert, update, delete on table public.medios_pago from authenticated;
grant select on table public.medios_pago to authenticated;
-- La clave nunca cambia: solo se pueden editar el nombre, si esta activa y el orden.
grant update (nombre, activo, orden, actualizado_en) on table public.medios_pago to authenticated;

drop policy if exists medios_pago_select on public.medios_pago;
create policy medios_pago_select on public.medios_pago
  for select to authenticated using (true);
drop policy if exists medios_pago_update_admin on public.medios_pago;
create policy medios_pago_update_admin on public.medios_pago
  for update to authenticated using (public.mb_is_admin()) with check (public.mb_is_admin());

-- Agregar una cuenta: crea la clave a partir del nombre y la suma al tipo metodo_pago.
-- (ALTER TYPE ... ADD VALUE funciona dentro de la transaccion; la clave nueva se
-- usa en las transacciones siguientes, que es cuando alguien registra un pago.)
create or replace function public.fn_crear_medio_pago(p_nombre text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_base text;
  v_clave text;
  v_n integer := 1;
begin
  if not public.mb_is_admin() then
    raise exception 'Solo un administrador puede agregar cuentas.';
  end if;
  if length(v_nombre) < 2 or length(v_nombre) > 60 then
    raise exception 'Escribe el nombre de la cuenta (de 2 a 60 letras).';
  end if;
  if exists (select 1 from public.medios_pago where lower(btrim(nombre)) = lower(v_nombre)) then
    raise exception 'Ya hay una cuenta que se llama así.';
  end if;

  v_base := btrim(regexp_replace(translate(lower(v_nombre), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '_', 'g'), '_');
  if length(v_base) < 2 then
    v_base := 'cuenta';
  end if;
  v_base := left(v_base, 50);
  v_clave := v_base;
  while v_clave = 'saldo_a_favor' or exists (select 1 from public.medios_pago where clave = v_clave) loop
    v_n := v_n + 1;
    v_clave := v_base || '_' || v_n;
  end loop;

  execute format('alter type public.metodo_pago add value if not exists %L', v_clave);
  insert into public.medios_pago (clave, nombre, activo, orden)
  values (v_clave, v_nombre, true, coalesce((select max(orden) from public.medios_pago where clave <> 'otro'), 0) + 10);
  return v_clave;
end;
$$;
revoke all on function public.fn_crear_medio_pago(text) from public, anon;
grant execute on function public.fn_crear_medio_pago(text) to authenticated;

-- 3 ------------------------------------------------------------------------
create table if not exists public.traslados_cuentas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  monto numeric(14, 2) not null check (monto > 0),
  metodo_origen public.metodo_pago not null,
  metodo_destino public.metodo_pago not null,
  notas text,
  estado text not null default 'activo' check (estado in ('activo', 'anulado')),
  usuario_id uuid,
  creado_en timestamptz not null default now(),
  anulado_en timestamptz,
  anulado_por uuid,
  motivo_anulacion text,
  constraint traslado_cuentas_distintas check (metodo_origen <> metodo_destino),
  constraint traslado_sin_saldo_a_favor check (metodo_origen <> 'saldo_a_favor' and metodo_destino <> 'saldo_a_favor')
);
create index if not exists idx_traslados_cuentas_fecha on public.traslados_cuentas (fecha);

alter table public.traslados_cuentas enable row level security;
revoke all on table public.traslados_cuentas from anon;

drop policy if exists traslados_cuentas_select_admin_caja on public.traslados_cuentas;
create policy traslados_cuentas_select_admin_caja on public.traslados_cuentas
  for select using (public.mb_is_admin_or_caja());
drop policy if exists traslados_cuentas_insert_admin on public.traslados_cuentas;
create policy traslados_cuentas_insert_admin on public.traslados_cuentas
  for insert with check (public.mb_is_admin());
drop policy if exists traslados_cuentas_update_admin on public.traslados_cuentas;
create policy traslados_cuentas_update_admin on public.traslados_cuentas
  for update using (public.mb_is_admin()) with check (public.mb_is_admin());
-- Sin politica de borrado: un traslado equivocado se anula, no se borra.

-- 4 ------------------------------------------------------------------------
alter table public.liquidaciones_resumen_cuentas
  add column if not exists traslados_entrada numeric not null default 0,
  add column if not exists traslados_salida numeric not null default 0;

-- Igual a la version en produccion (leida el 2026-10-29), con dos cambios:
--   - metodos: todas las claves del tipo metodo_pago menos saldo_a_favor;
--   - traslados_entrada / traslados_salida: mueven el saldo neto de cada cuenta,
--     pero NO entran a ingresos ni egresos (la utilidad y los socios no cambian).
CREATE OR REPLACE FUNCTION public.fn_cerrar_liquidacion_impl(p_periodo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_inicio DATE;
  v_fin DATE;
  v_estado TEXT;
  v_ingresos_operativos NUMERIC;
  v_egresos_periodo NUMERIC;
  v_utilidad_neta NUMERIC;
  v_donaciones_total NUMERIC;
  v_ventas_externas_total NUMERIC;
BEGIN
  SELECT fecha_inicio, fecha_fin, estado::TEXT
  INTO v_inicio, v_fin, v_estado
  FROM periodos
  WHERE id = p_periodo_id
  FOR UPDATE;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Periodo no encontrado';
  END IF;

  IF v_estado <> 'abierto' THEN
    RETURN;
  END IF;

  WITH metodos AS (
    SELECT e.enumlabel::TEXT AS metodo_pago
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'metodo_pago' AND e.enumlabel <> 'saldo_a_favor'
  ),
  abonos_agg AS (
    SELECT LOWER(COALESCE(pa.metodo_pago::TEXT, 'otro')) AS metodo_pago,
           SUM(pa.monto) AS monto
    FROM pagos_abonos pa
    WHERE pa.fecha_pago BETWEEN v_inicio AND v_fin
      AND COALESCE(pa.estado, 'activo') <> 'anulado'
      AND (pa.notas IS NULL OR pa.notas NOT ILIKE '%[ANULADO]%')
      AND COALESCE(LOWER(pa.origen_fondos), '') <> 'saldo_a_favor'
      AND COALESCE(LOWER(pa.metodo_pago::TEXT), '') <> 'saldo_a_favor'
    GROUP BY 1
  ),
  saldo_favor_ingresos_agg AS (
    SELECT LOWER(COALESCE(msf.metodo_pago::TEXT, 'otro')) AS metodo_pago,
           SUM(msf.monto) AS monto
    FROM movimientos_saldo_favor msf
    WHERE msf.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(LOWER(msf.tipo), '') = 'ingreso'
      AND COALESCE(LOWER(msf.metodo_pago::TEXT), '') <> 'saldo_a_favor'
      AND (msf.notas IS NULL OR msf.notas NOT ILIKE '%[ANULADO]%')
      AND (
        msf.notas IS NULL OR (
          msf.notas NOT ILIKE '%Ajuste de aplicación de saldo a favor%'
          AND msf.notas NOT ILIKE '%Ajuste de aplicacion de saldo a favor%'
          AND (msf.notas NOT ILIKE '%Ajuste de saldo a favor por edición del abono%' OR COALESCE(LOWER(msf.metodo_pago::TEXT), '') NOT IN ('', 'saldo_a_favor'))
          AND (msf.notas NOT ILIKE '%Ajuste de saldo a favor por edicion del abono%' OR COALESCE(LOWER(msf.metodo_pago::TEXT), '') NOT IN ('', 'saldo_a_favor'))
          AND msf.notas NOT ILIKE '%Reversion automatica por anulacion del anticipo%'
          AND msf.notas NOT ILIKE '%Reversion automatica por eliminacion del anticipo%'
        )
      )
    GROUP BY 1
  ),
  donaciones_agg AS (
    SELECT LOWER(COALESCE(d.metodo_pago::TEXT, 'otro')) AS metodo_pago,
           SUM(d.monto) AS monto
    FROM donaciones_asistentes d
    WHERE d.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(d.estado, 'activo') <> 'anulado'
      AND (d.notas IS NULL OR d.notas NOT ILIKE '%[ANULADO]%')
    GROUP BY 1
  ),
  ventas_externas_agg AS (
    SELECT LOWER(COALESCE(v.metodo_pago::TEXT, 'otro')) AS metodo_pago,
           SUM(v.monto) AS monto
    FROM ventas_externas v
    WHERE v.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(v.estado, 'activo') <> 'anulado'
      AND (v.notas IS NULL OR v.notas NOT ILIKE '%[ANULADO]%')
    GROUP BY 1
  ),
  egresos_agg AS (
    SELECT LOWER(COALESCE(e.metodo_pago::TEXT, 'otro')) AS metodo_pago,
           SUM(e.monto) AS monto
    FROM egresos e
    WHERE e.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(e.estado, 'activo') <> 'anulado'
      AND (e.notas IS NULL OR e.notas NOT ILIKE '%[ANULADO]%')
    GROUP BY 1
  ),
  adelantos_agg AS (
    SELECT LOWER(COALESCE(a.metodo_pago::TEXT, 'otro')) AS metodo_pago,
           SUM(a.monto) AS monto
    FROM adelantos_socios a
    WHERE a.fecha BETWEEN v_inicio AND v_fin
    GROUP BY 1
  ),
  traslados_entrada_agg AS (
    SELECT t.metodo_destino::TEXT AS metodo_pago, SUM(t.monto) AS monto
    FROM traslados_cuentas t
    WHERE t.fecha BETWEEN v_inicio AND v_fin
      AND t.estado <> 'anulado'
    GROUP BY 1
  ),
  traslados_salida_agg AS (
    SELECT t.metodo_origen::TEXT AS metodo_pago, SUM(t.monto) AS monto
    FROM traslados_cuentas t
    WHERE t.fecha BETWEEN v_inicio AND v_fin
      AND t.estado <> 'anulado'
    GROUP BY 1
  ),
  resumen AS (
    SELECT
      m.metodo_pago::metodo_pago AS metodo_pago,
      COALESCE(ab.monto, 0) + COALESCE(sf.monto, 0) AS ingresos_abonos,
      COALESCE(dn.monto, 0) AS ingresos_donaciones,
      COALESCE(ve.monto, 0) AS ingresos_ventas_externas,
      COALESCE(eg.monto, 0) AS salidas_egresos,
      COALESCE(ad.monto, 0) AS salidas_adelantos,
      COALESCE(te.monto, 0) AS traslados_entrada,
      COALESCE(ts.monto, 0) AS traslados_salida
    FROM metodos m
    LEFT JOIN abonos_agg ab ON ab.metodo_pago = m.metodo_pago
    LEFT JOIN saldo_favor_ingresos_agg sf ON sf.metodo_pago = m.metodo_pago
    LEFT JOIN donaciones_agg dn ON dn.metodo_pago = m.metodo_pago
    LEFT JOIN ventas_externas_agg ve ON ve.metodo_pago = m.metodo_pago
    LEFT JOIN egresos_agg eg ON eg.metodo_pago = m.metodo_pago
    LEFT JOIN adelantos_agg ad ON ad.metodo_pago = m.metodo_pago
    LEFT JOIN traslados_entrada_agg te ON te.metodo_pago = m.metodo_pago
    LEFT JOIN traslados_salida_agg ts ON ts.metodo_pago = m.metodo_pago
  )
  INSERT INTO liquidaciones_resumen_cuentas (
    periodo_id,
    metodo_pago,
    total_ingresos,
    total_salidas,
    saldo_neto_periodo,
    ingresos_abonos,
    ingresos_donaciones,
    ingresos_ventas_externas,
    salidas_egresos,
    salidas_adelantos,
    traslados_entrada,
    traslados_salida,
    created_at,
    updated_at
  )
  SELECT
    p_periodo_id,
    r.metodo_pago,
    r.ingresos_abonos + r.ingresos_donaciones + r.ingresos_ventas_externas,
    r.salidas_egresos,
    r.ingresos_abonos + r.ingresos_donaciones + r.ingresos_ventas_externas - r.salidas_egresos
      + r.traslados_entrada - r.traslados_salida,
    r.ingresos_abonos,
    r.ingresos_donaciones,
    r.ingresos_ventas_externas,
    r.salidas_egresos,
    r.salidas_adelantos,
    r.traslados_entrada,
    r.traslados_salida,
    NOW(),
    NOW()
  FROM resumen r
  ON CONFLICT (periodo_id, metodo_pago) DO UPDATE SET
    total_ingresos = EXCLUDED.total_ingresos,
    total_salidas = EXCLUDED.total_salidas,
    saldo_neto_periodo = EXCLUDED.saldo_neto_periodo,
    ingresos_abonos = EXCLUDED.ingresos_abonos,
    ingresos_donaciones = EXCLUDED.ingresos_donaciones,
    ingresos_ventas_externas = EXCLUDED.ingresos_ventas_externas,
    salidas_egresos = EXCLUDED.salidas_egresos,
    salidas_adelantos = EXCLUDED.salidas_adelantos,
    traslados_entrada = EXCLUDED.traslados_entrada,
    traslados_salida = EXCLUDED.traslados_salida,
    updated_at = NOW();

  SELECT
    SUM(r.ingresos_abonos + r.ingresos_donaciones + r.ingresos_ventas_externas),
    SUM(r.salidas_egresos),
    SUM(r.ingresos_donaciones),
    SUM(r.ingresos_ventas_externas)
  INTO v_ingresos_operativos, v_egresos_periodo, v_donaciones_total, v_ventas_externas_total
  FROM liquidaciones_resumen_cuentas r
  WHERE r.periodo_id = p_periodo_id;

  v_utilidad_neta := COALESCE(v_ingresos_operativos, 0) - COALESCE(v_egresos_periodo, 0);

  INSERT INTO liquidaciones_socios (
    periodo_id,
    socio_id,
    ingresos_cobrados,
    donaciones_periodo,
    ingresos_operativos,
    egresos_periodo,
    utilidad_neta,
    porcentaje_aplicado,
    valor_correspondiente,
    adelantos_descontados,
    valor_neto_pagar
  )
  SELECT
    p_periodo_id,
    s.id,
    COALESCE(v_ingresos_operativos, 0) - COALESCE(v_donaciones_total, 0) - COALESCE(v_ventas_externas_total, 0) AS ingresos_cobrados,
    COALESCE(v_donaciones_total, 0) AS donaciones_periodo,
    COALESCE(v_ingresos_operativos, 0) AS ingresos_operativos,
    COALESCE(v_egresos_periodo, 0) AS egresos_periodo,
    v_utilidad_neta,
    s.porcentaje_participacion,
    ROUND((v_utilidad_neta * s.porcentaje_participacion) / 100, 2),
    (
      SELECT COALESCE(SUM(ad.monto), 0)
      FROM adelantos_socios ad
      WHERE ad.periodo_id = p_periodo_id
        AND ad.socio_id = s.id
    ),
    ROUND(
      ((v_utilidad_neta * s.porcentaje_participacion) / 100) -
      (
        SELECT COALESCE(SUM(ad.monto), 0)
        FROM adelantos_socios ad
        WHERE ad.periodo_id = p_periodo_id
          AND ad.socio_id = s.id
      ),
      2
    )
  FROM socios s
  WHERE s.activo = true
  ON CONFLICT (periodo_id, socio_id) DO UPDATE SET
    ingresos_cobrados = EXCLUDED.ingresos_cobrados,
    donaciones_periodo = EXCLUDED.donaciones_periodo,
    ingresos_operativos = EXCLUDED.ingresos_operativos,
    egresos_periodo = EXCLUDED.egresos_periodo,
    utilidad_neta = EXCLUDED.utilidad_neta,
    porcentaje_aplicado = EXCLUDED.porcentaje_aplicado,
    valor_correspondiente = EXCLUDED.valor_correspondiente,
    adelantos_descontados = EXCLUDED.adelantos_descontados,
    valor_neto_pagar = EXCLUDED.valor_neto_pagar;

  UPDATE periodos
  SET estado = 'cerrado'
  WHERE id = p_periodo_id;
END;
$function$;
