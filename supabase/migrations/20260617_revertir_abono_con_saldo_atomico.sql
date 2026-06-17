-- Reversion de un abono que genero saldo a favor por sobrepago, de forma ATOMICA.
--
-- Contexto: hoy un abono que genero sobrepago (movimientos_saldo_favor con nota
-- [ABONO:<pagoId>]) NO se puede deshacer de forma segura: el Historial General
-- lo bloquea (ABONO_CON_SALDO_BLOQUEADO) y deleteCuenta no aplica si la cuenta
-- tiene pagos validos. Esta RPC habilita un flujo seguro y atomico desde el
-- detalle de la cuenta, sin tocar el bloqueo del Historial General.
--
-- Esta migracion es ADITIVA y NO destructiva:
-- - No hace DROP de nada, no borra datos ni migraciones previas.
-- - No cambia RLS, roles, usuarios ni autenticacion.
-- - SECURITY INVOKER: la RLS vigente sigue gobernando (la reversion la ejecuta
--   un admin desde la server action requireAdmin).
--
-- Seguridad contable:
-- - Solo revierte abonos de origen 'pago_directo' (no toca pagos de saldo a favor).
-- - Solo permite la reversion si el saldo a favor generado por ese abono NO fue
--   consumido (disponible del asistente >= sobrepago).
-- - Anula el abono y neutraliza el saldo a favor [ABONO:id] en una sola
--   transaccion. El trigger trg_estado_cuenta recalcula el estado de la cuenta.

CREATE OR REPLACE FUNCTION public.revertir_abono_con_saldo_trx(
  p_abono_id uuid,
  p_cuenta_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_abono_cuenta_id uuid;
  v_abono_monto numeric;
  v_abono_estado text;
  v_abono_origen text;
  v_abono_notas text;
  v_asistente_id uuid;
  v_overflow numeric;
  v_disponible numeric;
  v_reverso_id uuid;
  v_usuario_id uuid := auth.uid();
  v_nota_reverso text := format(
    '[REVERSO_ABONO:%s] Reverso de saldo a favor por anulacion del abono con sobrepago.',
    p_abono_id
  );
BEGIN
  -- Bloquea la cuenta y obtiene el asistente para serializar por saldo.
  SELECT asistente_id INTO v_asistente_id
  FROM cuentas_por_cobrar
  WHERE id = p_cuenta_id
  FOR UPDATE;

  IF v_asistente_id IS NULL THEN
    RAISE EXCEPTION 'Cuenta no encontrada.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_asistente_id::text, 0));

  SELECT cuenta_id, monto, estado, origen_fondos, notas
  INTO v_abono_cuenta_id, v_abono_monto, v_abono_estado, v_abono_origen, v_abono_notas
  FROM pagos_abonos
  WHERE id = p_abono_id
  FOR UPDATE;

  IF v_abono_cuenta_id IS NULL THEN
    RAISE EXCEPTION 'No se encontro el abono a revertir.';
  END IF;
  IF v_abono_cuenta_id IS DISTINCT FROM p_cuenta_id THEN
    RAISE EXCEPTION 'El abono no pertenece a la cuenta indicada.';
  END IF;
  IF COALESCE(v_abono_estado, 'activo') = 'anulado' OR v_abono_notas ILIKE '%[ANULADO]%' THEN
    RAISE EXCEPTION 'El abono ya esta anulado.';
  END IF;
  IF LOWER(COALESCE(v_abono_origen, '')) = 'saldo_a_favor' THEN
    RAISE EXCEPTION 'Este pago proviene de saldo a favor; no se revierte por este flujo.';
  END IF;

  -- Saldo a favor generado por este abono (neto de [ABONO:id]).
  SELECT COALESCE(SUM(
    CASE WHEN tipo = 'ingreso' THEN monto WHEN tipo = 'aplicacion' THEN -monto ELSE 0 END
  ), 0)
  INTO v_overflow
  FROM movimientos_saldo_favor
  WHERE cuenta_id = p_cuenta_id
    AND notas ILIKE '%[ABONO:' || p_abono_id::text || ']%';

  IF v_overflow > 0 THEN
    SELECT COALESCE(SUM(
      CASE WHEN tipo = 'ingreso' THEN monto WHEN tipo = 'aplicacion' THEN -monto ELSE 0 END
    ), 0)
    INTO v_disponible
    FROM movimientos_saldo_favor
    WHERE asistente_id = v_asistente_id;

    IF v_disponible < v_overflow THEN
      RAISE EXCEPTION 'No se puede revertir: el saldo a favor generado por este abono ya fue consumido.';
    END IF;
  END IF;

  -- Anula el abono (el trigger recalcula el estado de la cuenta).
  UPDATE pagos_abonos
  SET estado = 'anulado',
      notas = btrim('[ANULADO] ' || COALESCE(v_abono_notas, ''))
  WHERE id = p_abono_id;

  IF v_overflow > 0 THEN
    -- Marca como anulado el ingreso de sobrepago (deja de contar como ingreso real).
    UPDATE movimientos_saldo_favor
    SET notas = btrim('[ANULADO] ' || COALESCE(notas, ''))
    WHERE cuenta_id = p_cuenta_id
      AND tipo = 'ingreso'
      AND notas ILIKE '%[ABONO:' || p_abono_id::text || ']%'
      AND notas NOT ILIKE '%[ANULADO]%';

    -- Aplicacion compensatoria: descuenta del disponible el sobrepago revertido.
    INSERT INTO movimientos_saldo_favor (
      asistente_id, cuenta_id, tipo, monto, metodo_pago, fecha, notas, usuario_id
    )
    VALUES (
      v_asistente_id, p_cuenta_id, 'aplicacion', v_overflow, 'saldo_a_favor', CURRENT_DATE,
      v_nota_reverso, v_usuario_id
    )
    RETURNING id INTO v_reverso_id;
  END IF;

  INSERT INTO auditoria_financiera (
    tabla_afectada, registro_id, usuario_id, accion, valor_anterior, valor_nuevo, motivo
  )
  VALUES (
    'pagos_abonos', p_abono_id, v_usuario_id, 'anular_abono_con_saldo', v_abono_monto, 0,
    'Anulacion de abono con sobrepago desde el detalle de la cuenta.'
  );

  IF v_reverso_id IS NOT NULL THEN
    INSERT INTO auditoria_financiera (
      tabla_afectada, registro_id, usuario_id, accion, valor_anterior, valor_nuevo, motivo
    )
    VALUES (
      'movimientos_saldo_favor', v_reverso_id, v_usuario_id, 'reversion_saldo_sobrepago', NULL, v_overflow,
      v_nota_reverso
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revertir_abono_con_saldo_trx(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revertir_abono_con_saldo_trx(uuid, uuid) TO authenticated, service_role;
