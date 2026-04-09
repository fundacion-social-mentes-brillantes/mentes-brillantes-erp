DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'metodo_pago'
      AND e.enumlabel = 'saldo_a_favor'
  ) THEN
    ALTER TYPE public.metodo_pago ADD VALUE 'saldo_a_favor';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION fn_cerrar_liquidacion(p_periodo_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_inicio DATE;
  v_fin DATE;
  v_estado TEXT;
  v_ingresos_operativos NUMERIC;
  v_egresos_periodo NUMERIC;
  v_utilidad_neta NUMERIC;
  v_donaciones_total NUMERIC;
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
    SELECT unnest(ARRAY['efectivo','nequi','daviplata','otro']::TEXT[]) AS metodo_pago
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
      AND (msf.notas IS NULL OR msf.notas NOT ILIKE '%[ANULADO]%')
      AND (
        msf.notas IS NULL OR (
          msf.notas NOT ILIKE '%Ajuste de aplicación de saldo a favor%'
          AND msf.notas NOT ILIKE '%Ajuste de aplicacion de saldo a favor%'
          AND msf.notas NOT ILIKE '%Ajuste de saldo a favor por edición del abono%'
          AND msf.notas NOT ILIKE '%Ajuste de saldo a favor por edicion del abono%'
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
  resumen AS (
    SELECT
      m.metodo_pago::metodo_pago AS metodo_pago,
      COALESCE(ab.monto, 0) + COALESCE(sf.monto, 0) AS ingresos_abonos,
      COALESCE(dn.monto, 0) AS ingresos_donaciones,
      COALESCE(eg.monto, 0) AS salidas_egresos,
      COALESCE(ad.monto, 0) AS salidas_adelantos
    FROM metodos m
    LEFT JOIN abonos_agg ab ON ab.metodo_pago = m.metodo_pago
    LEFT JOIN saldo_favor_ingresos_agg sf ON sf.metodo_pago = m.metodo_pago
    LEFT JOIN donaciones_agg dn ON dn.metodo_pago = m.metodo_pago
    LEFT JOIN egresos_agg eg ON eg.metodo_pago = m.metodo_pago
    LEFT JOIN adelantos_agg ad ON ad.metodo_pago = m.metodo_pago
  )
  INSERT INTO liquidaciones_resumen_cuentas (
    periodo_id,
    metodo_pago,
    total_ingresos,
    total_salidas,
    saldo_neto_periodo,
    ingresos_abonos,
    ingresos_donaciones,
    salidas_egresos,
    salidas_adelantos,
    created_at,
    updated_at
  )
  SELECT
    p_periodo_id,
    r.metodo_pago,
    r.ingresos_abonos + r.ingresos_donaciones,
    r.salidas_egresos,
    r.ingresos_abonos + r.ingresos_donaciones - r.salidas_egresos,
    r.ingresos_abonos,
    r.ingresos_donaciones,
    r.salidas_egresos,
    r.salidas_adelantos,
    NOW(),
    NOW()
  FROM resumen r
  ON CONFLICT (periodo_id, metodo_pago) DO UPDATE SET
    total_ingresos = EXCLUDED.total_ingresos,
    total_salidas = EXCLUDED.total_salidas,
    saldo_neto_periodo = EXCLUDED.saldo_neto_periodo,
    ingresos_abonos = EXCLUDED.ingresos_abonos,
    ingresos_donaciones = EXCLUDED.ingresos_donaciones,
    salidas_egresos = EXCLUDED.salidas_egresos,
    salidas_adelantos = EXCLUDED.salidas_adelantos,
    updated_at = NOW();

  SELECT
    SUM(r.ingresos_abonos + r.ingresos_donaciones),
    SUM(r.salidas_egresos),
    SUM(r.ingresos_donaciones)
  INTO v_ingresos_operativos, v_egresos_periodo, v_donaciones_total
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
    COALESCE(v_ingresos_operativos, 0) - COALESCE(v_donaciones_total, 0) AS ingresos_cobrados,
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
$$;
