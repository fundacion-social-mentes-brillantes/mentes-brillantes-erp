-- Fix de consistencia del estado de cuenta tras anular un pago.
--
-- Bug: la version del trigger en produccion sumaba TODOS los pagos (incluidos
-- los anulados), por lo que al revertir/anular un abono la cuenta seguia
-- mostrandose 'pagado' aunque su pendiente real volviera a existir.
--
-- Esta version excluye los pagos anulados (por estado='anulado' o por nota
-- [ANULADO]), alineando el trigger con schema.sql, con
-- calcularEstadoCuentaDesdePagos y con la regla 6 (los anulados no cuentan).
--
-- Aditiva y NO destructiva:
-- - Solo CREATE OR REPLACE de la funcion del trigger ya existente.
-- - No recrea el trigger, no borra datos, no toca RLS, roles ni autenticacion.
-- - Conserva el search_path endurecido vigente en produccion.
CREATE OR REPLACE FUNCTION public.actualizar_estado_cuenta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_cuenta_id uuid;
  v_total numeric;
  v_abonado numeric;
BEGIN
  v_cuenta_id := COALESCE(NEW.cuenta_id, OLD.cuenta_id);
  IF v_cuenta_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT valor_total INTO v_total
  FROM cuentas_por_cobrar
  WHERE id = v_cuenta_id;

  SELECT COALESCE(SUM(monto), 0) INTO v_abonado
  FROM pagos_abonos
  WHERE cuenta_id = v_cuenta_id
    AND COALESCE(estado, 'activo') <> 'anulado'
    AND (notas IS NULL OR notas NOT ILIKE '%[ANULADO]%');

  UPDATE cuentas_por_cobrar
  SET estado = CASE
    WHEN v_abonado >= v_total THEN 'pagado'::estado_cuenta
    WHEN v_abonado > 0 THEN 'parcial'::estado_cuenta
    ELSE 'pendiente'::estado_cuenta
  END
  WHERE id = v_cuenta_id;

  RETURN NULL;
END;
$$;
