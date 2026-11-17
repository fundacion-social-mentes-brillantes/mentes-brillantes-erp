-- La plata de los talleres va aparte de la fundacion (pedido de Sebastian del
-- 16 nov 2026): sus ingresos y gastos ya no entran a la liquidacion de los
-- socios, y cada taller tiene su propia nomina, repartida con los mismos
-- porcentajes de los socios activos.
--
-- 1. Adelantos a cuenta de un taller: van con taller_id y sin periodo; se
--    descuentan al repartir ese taller, no en la liquidacion de la fundacion.
-- 2. Repartos de cada taller (talleres_repartos y su detalle por socio). Solo
--    se anotan: la plata se entrega por fuera, igual que la liquidacion. No se
--    borran: un reparto equivocado se anula con su motivo.
-- 3. Resumen por cuenta: la plata de los talleres sigue en el saldo de cada
--    cuenta (es plata real que entro y salio), pero en columnas aparte, fuera
--    de los ingresos y salidas de la fundacion.
-- 4. fn_guardar_reparto_taller: guarda un reparto con su detalle en un solo
--    paso, y no deja repartir dos veces lo mismo si dos personas lo hacen a la vez.
-- 5. fn_cerrar_liquidacion_impl sin la plata de los talleres. Los periodos ya
--    cerrados no se recalculan (ninguno tenia plata de talleres).

-- 1 ------------------------------------------------------------------------
alter table public.adelantos_socios
  add column if not exists taller_id uuid references public.talleres(id) on delete restrict;
create index if not exists adelantos_socios_taller_idx on public.adelantos_socios (taller_id) where taller_id is not null;
alter table public.adelantos_socios drop constraint if exists adelantos_socios_taller_sin_periodo;
alter table public.adelantos_socios
  add constraint adelantos_socios_taller_sin_periodo check (taller_id is null or periodo_id is null);
comment on column public.adelantos_socios.taller_id is
  'Adelanto a cuenta de un taller: se descuenta al repartir ese taller y no es de ningun periodo de la fundacion.';

-- 2 ------------------------------------------------------------------------
create table if not exists public.talleres_repartos (
  id uuid primary key default gen_random_uuid(),
  taller_id uuid not null references public.talleres(id) on delete restrict,
  fecha date not null,
  -- Las cuentas del taller cuando se repartio (todo lo de siempre, no solo lo nuevo).
  recaudado numeric(14, 2) not null,
  gastos numeric(14, 2) not null,
  repartido_antes numeric(14, 2) not null,
  -- Lo que se reparte en este: lo que quedaba por repartir.
  utilidad numeric(14, 2) not null,
  notas text,
  estado text not null default 'activo' check (estado in ('activo', 'anulado')),
  motivo_anulacion text,
  anulado_en timestamptz,
  anulado_por uuid,
  usuario_id uuid,
  creado_en timestamptz not null default now()
);
create index if not exists talleres_repartos_taller_idx on public.talleres_repartos (taller_id, creado_en);

create table if not exists public.talleres_repartos_socios (
  id uuid primary key default gen_random_uuid(),
  reparto_id uuid not null references public.talleres_repartos(id) on delete restrict,
  socio_id uuid not null references public.socios(id) on delete restrict,
  porcentaje numeric(6, 2) not null,
  valor_correspondiente numeric(14, 2) not null,
  adelantos_descontados numeric(14, 2) not null default 0,
  valor_neto numeric(14, 2) not null,
  unique (reparto_id, socio_id)
);

alter table public.talleres_repartos enable row level security;
alter table public.talleres_repartos_socios enable row level security;
revoke all on table public.talleres_repartos from anon;
revoke all on table public.talleres_repartos_socios from anon;

-- Lo que le toca a cada socio lo ve y lo maneja solo el admin, como la liquidacion.
drop policy if exists talleres_repartos_select_admin on public.talleres_repartos;
create policy talleres_repartos_select_admin on public.talleres_repartos for select using (public.mb_is_admin());
drop policy if exists talleres_repartos_insert_admin on public.talleres_repartos;
create policy talleres_repartos_insert_admin on public.talleres_repartos for insert with check (public.mb_is_admin());
drop policy if exists talleres_repartos_update_admin on public.talleres_repartos;
create policy talleres_repartos_update_admin on public.talleres_repartos
  for update using (public.mb_is_admin()) with check (public.mb_is_admin());

drop policy if exists talleres_repartos_socios_select_admin on public.talleres_repartos_socios;
create policy talleres_repartos_socios_select_admin on public.talleres_repartos_socios for select using (public.mb_is_admin());
drop policy if exists talleres_repartos_socios_insert_admin on public.talleres_repartos_socios;
create policy talleres_repartos_socios_insert_admin on public.talleres_repartos_socios for insert with check (public.mb_is_admin());
-- Sin politicas de borrado: un reparto equivocado se anula, no se borra.

-- 3 ------------------------------------------------------------------------
alter table public.liquidaciones_resumen_cuentas
  add column if not exists ingresos_talleres numeric not null default 0,
  add column if not exists salidas_talleres numeric not null default 0;

-- 4 ------------------------------------------------------------------------
create or replace function public.fn_guardar_reparto_taller(
  p_taller_id uuid,
  p_fecha date,
  p_recaudado numeric,
  p_gastos numeric,
  p_repartido_antes numeric,
  p_utilidad numeric,
  p_notas text,
  p_usuario_id uuid,
  p_socios jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_repartido numeric;
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.mb_is_admin() then
    raise exception 'Solo un administrador puede repartir un taller.';
  end if;
  -- Uno a la vez por taller: si otra persona repartio mientras tanto, lo que se calculo ya no vale.
  perform 1 from public.talleres where id = p_taller_id for update;
  if not found then
    raise exception 'Ese taller no existe.';
  end if;
  select coalesce(sum(utilidad), 0) into v_repartido
    from public.talleres_repartos where taller_id = p_taller_id and estado = 'activo';
  if v_repartido <> p_repartido_antes then
    raise exception 'Mientras tanto se repartió este taller: vuelve a mirar lo que queda por repartir.';
  end if;
  if jsonb_array_length(coalesce(p_socios, '[]'::jsonb)) = 0 then
    raise exception 'No hay socios activos para repartir.';
  end if;

  insert into public.talleres_repartos (taller_id, fecha, recaudado, gastos, repartido_antes, utilidad, notas, usuario_id)
  values (p_taller_id, p_fecha, p_recaudado, p_gastos, p_repartido_antes, p_utilidad, p_notas, p_usuario_id)
  returning id into v_id;

  insert into public.talleres_repartos_socios (reparto_id, socio_id, porcentaje, valor_correspondiente, adelantos_descontados, valor_neto)
  select v_id,
         (s ->> 'socio_id')::uuid,
         (s ->> 'porcentaje')::numeric,
         (s ->> 'valor_correspondiente')::numeric,
         coalesce((s ->> 'adelantos_descontados')::numeric, 0),
         (s ->> 'valor_neto')::numeric
    from jsonb_array_elements(p_socios) as s;

  return v_id;
end;
$$;
revoke all on function public.fn_guardar_reparto_taller(uuid, date, numeric, numeric, numeric, numeric, text, uuid, jsonb) from public, anon;
grant execute on function public.fn_guardar_reparto_taller(uuid, date, numeric, numeric, numeric, numeric, text, uuid, jsonb)
  to authenticated, service_role;

-- 5 ------------------------------------------------------------------------
-- Igual a la version en produccion (leida el 2026-11-16), con estos cambios:
--   - ventas externas de un taller (taller_inscripcion_id) y egresos de un taller
--     (taller_id) ya no entran a ingresos ni salidas de la fundacion: van en
--     ingresos_talleres y salidas_talleres, que si cuentan en el saldo de cada cuenta;
--   - adelantos a cuenta de un taller (taller_id) no entran al resumen de la fundacion.
create or replace function public.fn_cerrar_liquidacion_impl(p_periodo_id uuid)
 returns void
 language plpgsql
 set search_path to 'public', 'extensions'
as $function$
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
      AND v.taller_inscripcion_id IS NULL
      AND COALESCE(v.estado, 'activo') <> 'anulado'
      AND (v.notas IS NULL OR v.notas NOT ILIKE '%[ANULADO]%')
    GROUP BY 1
  ),
  talleres_ingresos_agg AS (
    SELECT LOWER(COALESCE(v.metodo_pago::TEXT, 'otro')) AS metodo_pago,
           SUM(v.monto) AS monto
    FROM ventas_externas v
    WHERE v.fecha BETWEEN v_inicio AND v_fin
      AND v.taller_inscripcion_id IS NOT NULL
      AND COALESCE(v.estado, 'activo') <> 'anulado'
      AND (v.notas IS NULL OR v.notas NOT ILIKE '%[ANULADO]%')
    GROUP BY 1
  ),
  egresos_agg AS (
    SELECT LOWER(COALESCE(e.metodo_pago::TEXT, 'otro')) AS metodo_pago,
           SUM(e.monto) AS monto
    FROM egresos e
    WHERE e.fecha BETWEEN v_inicio AND v_fin
      AND e.taller_id IS NULL
      AND COALESCE(e.estado, 'activo') <> 'anulado'
      AND (e.notas IS NULL OR e.notas NOT ILIKE '%[ANULADO]%')
    GROUP BY 1
  ),
  talleres_gastos_agg AS (
    SELECT LOWER(COALESCE(e.metodo_pago::TEXT, 'otro')) AS metodo_pago,
           SUM(e.monto) AS monto
    FROM egresos e
    WHERE e.fecha BETWEEN v_inicio AND v_fin
      AND e.taller_id IS NOT NULL
      AND COALESCE(e.estado, 'activo') <> 'anulado'
      AND (e.notas IS NULL OR e.notas NOT ILIKE '%[ANULADO]%')
    GROUP BY 1
  ),
  adelantos_agg AS (
    SELECT LOWER(COALESCE(a.metodo_pago::TEXT, 'otro')) AS metodo_pago,
           SUM(a.monto) AS monto
    FROM adelantos_socios a
    WHERE a.fecha BETWEEN v_inicio AND v_fin
      AND a.taller_id IS NULL
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
      COALESCE(ts.monto, 0) AS traslados_salida,
      COALESCE(ti.monto, 0) AS ingresos_talleres,
      COALESCE(tg.monto, 0) AS salidas_talleres
    FROM metodos m
    LEFT JOIN abonos_agg ab ON ab.metodo_pago = m.metodo_pago
    LEFT JOIN saldo_favor_ingresos_agg sf ON sf.metodo_pago = m.metodo_pago
    LEFT JOIN donaciones_agg dn ON dn.metodo_pago = m.metodo_pago
    LEFT JOIN ventas_externas_agg ve ON ve.metodo_pago = m.metodo_pago
    LEFT JOIN egresos_agg eg ON eg.metodo_pago = m.metodo_pago
    LEFT JOIN adelantos_agg ad ON ad.metodo_pago = m.metodo_pago
    LEFT JOIN traslados_entrada_agg te ON te.metodo_pago = m.metodo_pago
    LEFT JOIN traslados_salida_agg ts ON ts.metodo_pago = m.metodo_pago
    LEFT JOIN talleres_ingresos_agg ti ON ti.metodo_pago = m.metodo_pago
    LEFT JOIN talleres_gastos_agg tg ON tg.metodo_pago = m.metodo_pago
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
    ingresos_talleres,
    salidas_talleres,
    created_at,
    updated_at
  )
  SELECT
    p_periodo_id,
    r.metodo_pago,
    r.ingresos_abonos + r.ingresos_donaciones + r.ingresos_ventas_externas,
    r.salidas_egresos,
    r.ingresos_abonos + r.ingresos_donaciones + r.ingresos_ventas_externas - r.salidas_egresos
      + r.traslados_entrada - r.traslados_salida
      + r.ingresos_talleres - r.salidas_talleres,
    r.ingresos_abonos,
    r.ingresos_donaciones,
    r.ingresos_ventas_externas,
    r.salidas_egresos,
    r.salidas_adelantos,
    r.traslados_entrada,
    r.traslados_salida,
    r.ingresos_talleres,
    r.salidas_talleres,
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
    ingresos_talleres = EXCLUDED.ingresos_talleres,
    salidas_talleres = EXCLUDED.salidas_talleres,
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
