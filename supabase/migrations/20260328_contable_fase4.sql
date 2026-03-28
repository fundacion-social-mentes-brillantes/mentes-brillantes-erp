-- Fase 4 - Correcciones contables mínimas
-- 1) Excluir pagos anulados en vista_cuentas_saldos
-- 2) Alinear adelantos_socios con metodo_pago para resumen por cuenta

CREATE OR REPLACE VIEW vista_cuentas_saldos AS
SELECT 
  c.id,
  c.asistente_id,
  c.valor_total,
  COALESCE(SUM(p.monto), 0) AS total_abonado,
  (c.valor_total - COALESCE(SUM(p.monto), 0)) AS monto_pendiente,
  c.estado
FROM cuentas_por_cobrar c
LEFT JOIN pagos_abonos p
  ON c.id = p.cuenta_id
 AND p.estado <> 'anulado'
 AND (p.notas IS NULL OR p.notas NOT ILIKE '%[ANULADO]%')
GROUP BY c.id;

ALTER TABLE adelantos_socios
  ADD COLUMN IF NOT EXISTS metodo_pago metodo_pago NOT NULL DEFAULT 'otro';
