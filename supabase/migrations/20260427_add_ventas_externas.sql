CREATE TABLE IF NOT EXISTS ventas_externas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_row_id TEXT UNIQUE,
  comprador_nombre TEXT,
  concepto TEXT NOT NULL,
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  metodo_pago metodo_pago NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'anulado')),
  notas TEXT,
  usuario_id UUID REFERENCES auth.users(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ventas_externas_fecha ON ventas_externas (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_externas_estado ON ventas_externas (estado);

ALTER TABLE liquidaciones_resumen_cuentas
  ADD COLUMN IF NOT EXISTS ingresos_ventas_externas NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE VIEW vw_movimientos_generales AS
SELECT
  c.id AS movimiento_id,
  c.fecha_emision AS fecha,
  'cuenta_cobrar' AS tipo_movimiento,
  c.asistente_id,
  a.nombre AS asistente_nombre,
  c.concepto,
  NULL::TEXT AS metodo_pago,
  GREATEST(
    c.valor_total - COALESCE((
      SELECT SUM(pa.monto)
      FROM pagos_abonos pa
      WHERE pa.cuenta_id = c.id
        AND COALESCE(pa.estado, 'activo') <> 'anulado'
        AND (pa.notas IS NULL OR pa.notas NOT ILIKE '%[ANULADO]%')
    ), 0),
    0
  ) AS valor_deuda,
  0::NUMERIC(12,2) AS valor_ingreso,
  0::NUMERIC(12,2) AS valor_egreso,
  c.estado::TEXT AS estado_o_saldo,
  NULL::TEXT AS notas,
  c.creado_en,
  NULL::TEXT AS categoria
FROM cuentas_por_cobrar c
LEFT JOIN asistentes a ON a.id = c.asistente_id

UNION ALL

SELECT
  p.id AS movimiento_id,
  p.fecha_pago AS fecha,
  'abono' AS tipo_movimiento,
  c.asistente_id,
  a.nombre AS asistente_nombre,
  c.concepto,
  p.metodo_pago::TEXT AS metodo_pago,
  0::NUMERIC(12,2) AS valor_deuda,
  CASE
    WHEN COALESCE(p.estado, 'activo') <> 'anulado'
      AND (p.notas IS NULL OR p.notas NOT ILIKE '%[ANULADO]%')
      AND COALESCE(LOWER(p.origen_fondos), '') <> 'saldo_a_favor'
      AND COALESCE(LOWER(p.metodo_pago::TEXT), '') <> 'saldo_a_favor'
    THEN p.monto
    ELSE 0
  END AS valor_ingreso,
  0::NUMERIC(12,2) AS valor_egreso,
  p.estado AS estado_o_saldo,
  p.notas,
  p.creado_en,
  NULL::TEXT AS categoria
FROM pagos_abonos p
LEFT JOIN cuentas_por_cobrar c ON c.id = p.cuenta_id
LEFT JOIN asistentes a ON a.id = c.asistente_id

UNION ALL

SELECT
  msf.id AS movimiento_id,
  msf.fecha AS fecha,
  CASE WHEN msf.tipo = 'ingreso' THEN 'anticipo' ELSE 'aplicacion_saldo' END AS tipo_movimiento,
  msf.asistente_id,
  a.nombre AS asistente_nombre,
  COALESCE(msf.notas, 'Saldo a favor') AS concepto,
  msf.metodo_pago::TEXT AS metodo_pago,
  0::NUMERIC(12,2) AS valor_deuda,
  CASE WHEN msf.tipo = 'ingreso' THEN msf.monto ELSE 0 END AS valor_ingreso,
  CASE WHEN msf.tipo = 'aplicacion' THEN msf.monto ELSE 0 END AS valor_egreso,
  msf.tipo AS estado_o_saldo,
  msf.notas,
  msf.creado_en,
  NULL::TEXT AS categoria
FROM movimientos_saldo_favor msf
LEFT JOIN asistentes a ON a.id = msf.asistente_id

UNION ALL

SELECT
  e.id AS movimiento_id,
  e.fecha,
  'egreso' AS tipo_movimiento,
  NULL::UUID AS asistente_id,
  NULL::TEXT AS asistente_nombre,
  e.concepto,
  e.metodo_pago::TEXT AS metodo_pago,
  0::NUMERIC(12,2) AS valor_deuda,
  0::NUMERIC(12,2) AS valor_ingreso,
  CASE
    WHEN COALESCE(e.estado, 'activo') <> 'anulado'
      AND (e.notas IS NULL OR e.notas NOT ILIKE '%[ANULADO]%')
    THEN e.monto
    ELSE 0
  END AS valor_egreso,
  e.estado AS estado_o_saldo,
  e.notas,
  e.creado_en,
  e.categoria
FROM egresos e

UNION ALL

SELECT
  d.id AS movimiento_id,
  d.fecha,
  'donacion' AS tipo_movimiento,
  d.asistente_id,
  a.nombre AS asistente_nombre,
  'Donacion' AS concepto,
  d.metodo_pago::TEXT AS metodo_pago,
  0::NUMERIC(12,2) AS valor_deuda,
  CASE
    WHEN COALESCE(d.estado, 'activo') <> 'anulado'
      AND (d.notas IS NULL OR d.notas NOT ILIKE '%[ANULADO]%')
    THEN d.monto
    ELSE 0
  END AS valor_ingreso,
  0::NUMERIC(12,2) AS valor_egreso,
  d.estado AS estado_o_saldo,
  d.notas,
  d.creado_en,
  NULL::TEXT AS categoria
FROM donaciones_asistentes d
LEFT JOIN asistentes a ON a.id = d.asistente_id

UNION ALL

SELECT
  v.id AS movimiento_id,
  v.fecha,
  'venta_externa' AS tipo_movimiento,
  NULL::UUID AS asistente_id,
  NULL::TEXT AS asistente_nombre,
  v.concepto,
  v.metodo_pago::TEXT AS metodo_pago,
  0::NUMERIC(12,2) AS valor_deuda,
  CASE
    WHEN COALESCE(v.estado, 'activo') <> 'anulado'
      AND (v.notas IS NULL OR v.notas NOT ILIKE '%[ANULADO]%')
    THEN v.monto
    ELSE 0
  END AS valor_ingreso,
  0::NUMERIC(12,2) AS valor_egreso,
  v.estado AS estado_o_saldo,
  v.notas,
  v.creado_en,
  NULL::TEXT AS categoria
FROM ventas_externas v;

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
  resumen AS (
    SELECT
      m.metodo_pago::metodo_pago AS metodo_pago,
      COALESCE(ab.monto, 0) + COALESCE(sf.monto, 0) AS ingresos_abonos,
      COALESCE(dn.monto, 0) AS ingresos_donaciones,
      COALESCE(ve.monto, 0) AS ingresos_ventas_externas,
      COALESCE(eg.monto, 0) AS salidas_egresos,
      COALESCE(ad.monto, 0) AS salidas_adelantos
    FROM metodos m
    LEFT JOIN abonos_agg ab ON ab.metodo_pago = m.metodo_pago
    LEFT JOIN saldo_favor_ingresos_agg sf ON sf.metodo_pago = m.metodo_pago
    LEFT JOIN donaciones_agg dn ON dn.metodo_pago = m.metodo_pago
    LEFT JOIN ventas_externas_agg ve ON ve.metodo_pago = m.metodo_pago
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
    ingresos_ventas_externas,
    salidas_egresos,
    salidas_adelantos,
    created_at,
    updated_at
  )
  SELECT
    p_periodo_id,
    r.metodo_pago,
    r.ingresos_abonos + r.ingresos_donaciones + r.ingresos_ventas_externas,
    r.salidas_egresos,
    r.ingresos_abonos + r.ingresos_donaciones + r.ingresos_ventas_externas - r.salidas_egresos,
    r.ingresos_abonos,
    r.ingresos_donaciones,
    r.ingresos_ventas_externas,
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
    ingresos_ventas_externas = EXCLUDED.ingresos_ventas_externas,
    salidas_egresos = EXCLUDED.salidas_egresos,
    salidas_adelantos = EXCLUDED.salidas_adelantos,
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
$$;
