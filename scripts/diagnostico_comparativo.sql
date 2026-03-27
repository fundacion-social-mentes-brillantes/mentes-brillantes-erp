-- Diagnóstico comparativo antes/después
-- Reemplaza los IDs de ejemplo antes de ejecutar en staging/QA. No muta datos.
-- Parámetros esperados (ajusta manualmente):
--   :p_periodo_id  -> UUID del período a validar
--   :p_cuenta_ids  -> lista de hasta 3 cuentas relevantes (ej: ('id1','id2','id3'))

-- 1) Totales por método en vista de movimientos (criterio actual)
WITH mov AS (
  SELECT metodo_pago, valor_ingreso, valor_egreso
  FROM vw_movimientos_generales
  WHERE fecha BETWEEN (SELECT fecha_inicio FROM periodos WHERE id = :p_periodo_id)
    AND (SELECT fecha_fin FROM periodos WHERE id = :p_periodo_id)
    AND metodo_pago IS NOT NULL
),
met AS (
  SELECT unnest(ARRAY['efectivo','nequi','daviplata','otro']) AS metodo_pago
),
agregado AS (
  SELECT m.metodo_pago,
         COALESCE(SUM(CASE WHEN valor_ingreso > 0 THEN valor_ingreso END),0) AS ingresos,
         COALESCE(SUM(CASE WHEN valor_egreso > 0 THEN valor_egreso END),0) AS egresos
  FROM met m
  LEFT JOIN mov v ON v.metodo_pago = m.metodo_pago
  GROUP BY m.metodo_pago
)
SELECT *, (ingresos - egresos) AS saldo_neto FROM agregado ORDER BY metodo_pago;

-- 2) Snapshot (si existe) en liquidaciones_resumen_cuentas
SELECT metodo_pago, total_ingresos, total_salidas, saldo_neto_periodo
FROM liquidaciones_resumen_cuentas
WHERE periodo_id = :p_periodo_id
ORDER BY metodo_pago;

-- 3) Estado de cuentas ejemplo (hasta 3)
SELECT c.id, c.concepto, c.valor_total,
  (SELECT COALESCE(SUM(monto),0) FROM pagos_abonos pa WHERE pa.cuenta_id = c.id AND pa.estado <> 'anulado' AND (pa.notas IS NULL OR pa.notas NOT ILIKE '%[ANULADO]%')) AS abonado_valido,
  (SELECT COALESCE(SUM(monto),0) FROM pagos_abonos pa WHERE pa.cuenta_id = c.id) AS abonado_total,
  c.estado
FROM cuentas_por_cobrar c
WHERE c.id IN :p_cuenta_ids;
