-- Fase 4 - Reescritura mínima de fn_cerrar_liquidacion con preagregación por método

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
  SELECT fecha_inicio, fecha_fin, estado INTO v_inicio, v_fin, v_estado
  FROM periodos WHERE id = p_periodo_id FOR UPDATE;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Periodo no encontrado';
  END IF;

  IF v_estado <> 'abierto' THEN
    RETURN;
  END IF;

  WITH metodos AS (
    SELECT unnest(ARRAY['efectivo','nequi','daviplata','otro']::text[]) AS metodo_pago
  ),
  abonos_agg AS (
    SELECT LOWER(COALESCE(metodo_pago::text,'otro')) AS metodo_pago,
           SUM(valor_ingreso) AS monto
    FROM vw_movimientos_generales
    WHERE tipo_movimiento = 'abono'
      AND fecha BETWEEN v_inicio AND v_fin
    GROUP BY 1
  ),
  donaciones_agg AS (
    SELECT LOWER(COALESCE(metodo_pago::text,'otro')) AS metodo_pago,
           SUM(valor_ingreso) AS monto
    FROM vw_movimientos_generales
    WHERE tipo_movimiento = 'donacion'
      AND fecha BETWEEN v_inicio AND v_fin
    GROUP BY 1
  ),
  egresos_agg AS (
    SELECT LOWER(COALESCE(metodo_pago::text,'otro')) AS metodo_pago,
           SUM(monto) AS monto
    FROM egresos
    WHERE fecha BETWEEN v_inicio AND v_fin
      AND estado <> 'anulado'
      AND (notas IS NULL OR notas NOT ILIKE '%[ANULADO]%')
    GROUP BY 1
  ),
  adelantos_agg AS (
    SELECT LOWER(COALESCE(metodo_pago::text,'otro')) AS metodo_pago,
           SUM(monto) AS monto
    FROM adelantos_socios
    WHERE fecha BETWEEN v_inicio AND v_fin
    GROUP BY 1
  ),
  resumen AS (
    SELECT
      m.metodo_pago::metodo_pago AS metodo_pago,
      COALESCE(a.monto,0) AS ingresos_abonos,
      COALESCE(d.monto,0) AS ingresos_donaciones,
      COALESCE(e.monto,0) AS salidas_egresos,
      COALESCE(ad.monto,0) AS salidas_adelantos
    FROM metodos m
    LEFT JOIN abonos_agg a ON a.metodo_pago = m.metodo_pago
    LEFT JOIN donaciones_agg d ON d.metodo_pago = m.metodo_pago
    LEFT JOIN egresos_agg e ON e.metodo_pago = m.metodo_pago
    LEFT JOIN adelantos_agg ad ON ad.metodo_pago = m.metodo_pago
  )
  INSERT INTO liquidaciones_resumen_cuentas (
    periodo_id, metodo_pago, total_ingresos, total_salidas, saldo_neto_periodo,
    ingresos_abonos, ingresos_donaciones, salidas_egresos, salidas_adelantos,
    created_at, updated_at
  )
  SELECT
    p_periodo_id,
    r.metodo_pago,
    (r.ingresos_abonos + r.ingresos_donaciones) AS total_ingresos,
    (r.salidas_egresos + r.salidas_adelantos) AS total_salidas,
    (r.ingresos_abonos + r.ingresos_donaciones - r.salidas_egresos - r.salidas_adelantos) AS saldo_neto_periodo,
    r.ingresos_abonos,
    r.ingresos_donaciones,
    r.salidas_egresos,
    r.salidas_adelantos,
    NOW(),
    NOW()
  FROM resumen r
  ON CONFLICT (periodo_id, metodo_pago) DO UPDATE SET
    total_ingresos      = EXCLUDED.total_ingresos,
    total_salidas       = EXCLUDED.total_salidas,
    saldo_neto_periodo  = EXCLUDED.saldo_neto_periodo,
    ingresos_abonos     = EXCLUDED.ingresos_abonos,
    ingresos_donaciones = EXCLUDED.ingresos_donaciones,
    salidas_egresos     = EXCLUDED.salidas_egresos,
    salidas_adelantos   = EXCLUDED.salidas_adelantos,
    updated_at          = NOW();

  SELECT
    SUM(r.ingresos_abonos + r.ingresos_donaciones),
    SUM(r.salidas_egresos + r.salidas_adelantos),
    SUM(r.ingresos_donaciones)
  INTO v_ingresos_operativos, v_egresos_periodo, v_donaciones_total
  FROM liquidaciones_resumen_cuentas r
  WHERE periodo_id = p_periodo_id;

  v_utilidad_neta := COALESCE(v_ingresos_operativos,0) - COALESCE(v_egresos_periodo,0);

  INSERT INTO liquidaciones_socios (
    periodo_id, socio_id, ingresos_cobrados, donaciones_periodo, ingresos_operativos,
    egresos_periodo, utilidad_neta, porcentaje_aplicado, valor_correspondiente,
    adelantos_descontados, valor_neto_pagar
  )
  SELECT
    p_periodo_id,
    s.id,
    COALESCE(v_ingresos_operativos,0) - COALESCE(v_donaciones_total,0) AS ingresos_cobrados,
    COALESCE(v_donaciones_total,0) AS donaciones_periodo,
    COALESCE(v_ingresos_operativos,0) AS ingresos_operativos,
    COALESCE(v_egresos_periodo,0) AS egresos_periodo,
    v_utilidad_neta AS utilidad_neta,
    porcentaje_participacion AS porcentaje_aplicado,
    ROUND((v_utilidad_neta * porcentaje_participacion) / 100)::DECIMAL(12,2) AS valor_correspondiente,
    (
      SELECT COALESCE(SUM(monto),0) FROM adelantos_socios
      WHERE periodo_id = p_periodo_id AND socio_id = s.id
    ) AS adelantos_descontados,
    ROUND(((v_utilidad_neta * porcentaje_participacion) / 100) -
      (
        SELECT COALESCE(SUM(monto),0) FROM adelantos_socios
        WHERE periodo_id = p_periodo_id AND socio_id = s.id
      ), 2) AS valor_neto_pagar
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

  UPDATE periodos SET estado = 'cerrado' WHERE id = p_periodo_id;
END;
$$;
