-- Diagnóstico antes/después (ejecutar manualmente en entorno de pruebas)
-- 1) Ajusta estos identificadores antes de correr:
--    :cuenta_ids  -> lista de hasta 3 cuentas (UUID) separados por coma
--    :periodo_id  -> período a comparar

-- A) Cuentas por cobrar (vista vs. suma cruda de pagos)
WITH pagos_crudos AS (
  SELECT cuenta_id, SUM(monto) AS total_abonos_crudos
  FROM pagos_abonos
  WHERE cuenta_id IN (:cuenta_ids)
  GROUP BY cuenta_id
),
pagos_validos AS (
  SELECT cuenta_id, SUM(monto) AS total_abonos_validos
  FROM pagos_abonos
  WHERE cuenta_id IN (:cuenta_ids)
    AND estado <> 'anulado'
    AND (notas IS NULL OR notas NOT ILIKE '%[ANULADO]%')
  GROUP BY cuenta_id
)
SELECT c.id,
       c.valor_total,
       pc.total_abonos_crudos,
       pv.total_abonos_validos,
       vcs.total_abonado AS vista_total_abonado,
       vcs.monto_pendiente
FROM cuentas_por_cobrar c
LEFT JOIN pagos_crudos pc ON pc.cuenta_id = c.id
LEFT JOIN pagos_validos pv ON pv.cuenta_id = c.id
LEFT JOIN vista_cuentas_saldos vcs ON vcs.id = c.id
WHERE c.id IN (:cuenta_ids);

-- B) Resumen por método del período (proyección en vivo)
WITH metodos AS (
  SELECT unnest(ARRAY['efectivo','nequi','daviplata','otro']::text[]) AS metodo_pago
),
abonos AS (
  SELECT LOWER(COALESCE(metodo_pago::text,'otro')) AS metodo_pago, SUM(valor_ingreso) AS monto
  FROM vw_movimientos_generales
  WHERE tipo_movimiento = 'abono'
    AND fecha BETWEEN (SELECT fecha_inicio FROM periodos WHERE id=:periodo_id)
                    AND (SELECT fecha_fin FROM periodos WHERE id=:periodo_id)
  GROUP BY 1
),
donaciones AS (
  SELECT LOWER(COALESCE(metodo_pago::text,'otro')) AS metodo_pago, SUM(valor_ingreso) AS monto
  FROM vw_movimientos_generales
  WHERE tipo_movimiento = 'donacion'
    AND fecha BETWEEN (SELECT fecha_inicio FROM periodos WHERE id=:periodo_id)
                    AND (SELECT fecha_fin FROM periodos WHERE id=:periodo_id)
  GROUP BY 1
),
egresos AS (
  SELECT LOWER(COALESCE(metodo_pago::text,'otro')) AS metodo_pago, SUM(monto) AS monto
  FROM egresos
  WHERE estado <> 'anulado'
    AND (notas IS NULL OR notas NOT ILIKE '%[ANULADO]%')
    AND fecha BETWEEN (SELECT fecha_inicio FROM periodos WHERE id=:periodo_id)
                    AND (SELECT fecha_fin FROM periodos WHERE id=:periodo_id)
  GROUP BY 1
),
adelantos AS (
  SELECT LOWER(COALESCE(metodo_pago::text,'otro')) AS metodo_pago, SUM(monto) AS monto
  FROM adelantos_socios
  WHERE fecha BETWEEN (SELECT fecha_inicio FROM periodos WHERE id=:periodo_id)
                    AND (SELECT fecha_fin FROM periodos WHERE id=:periodo_id)
  GROUP BY 1
)
SELECT m.metodo_pago,
       COALESCE(a.monto,0) AS ingresos_abonos,
       COALESCE(d.monto,0) AS ingresos_donaciones,
       COALESCE(e.monto,0) AS salidas_egresos,
       COALESCE(ad.monto,0) AS salidas_adelantos,
       COALESCE(a.monto,0)+COALESCE(d.monto,0) AS total_ingresos,
       COALESCE(e.monto,0)+COALESCE(ad.monto,0) AS total_salidas,
       COALESCE(a.monto,0)+COALESCE(d.monto,0)-COALESCE(e.monto,0)-COALESCE(ad.monto,0) AS saldo_neto_periodo
FROM metodos m
LEFT JOIN abonos a ON a.metodo_pago = m.metodo_pago
LEFT JOIN donaciones d ON d.metodo_pago = m.metodo_pago
LEFT JOIN egresos e ON e.metodo_pago = m.metodo_pago
LEFT JOIN adelantos ad ON ad.metodo_pago = m.metodo_pago
ORDER BY m.metodo_pago;
