-- Reversion de anticipo (ingreso a saldo a favor), de forma ATOMICA.
--
-- Contexto: la server action revertirAnticipo marcaba el anticipo como
-- [ANULADO], insertaba una aplicacion compensatoria y dos filas de auditoria en
-- operaciones separadas con rollback manual. Ante una falla parcial podia
-- quedar el anticipo anulado sin compensacion (o al reves), descuadrando el
-- saldo a favor.
--
-- Esta migracion es ADITIVA y NO destructiva:
-- - No hace DROP de nada, no borra datos ni migraciones previas.
-- - No cambia RLS, roles, usuarios ni autenticacion.
-- - SECURITY INVOKER: la RLS vigente sigue gobernando (la reversion la ejecuta
--   un admin desde la server action requireAdmin). El modelo de permisos queda
--   intacto.
--
-- Atomicidad: todo corre en una sola transaccion (un EXCEPTION revierte todo),
-- con lock por asistente y revalidacion del disponible dentro de la transaccion.

CREATE OR REPLACE FUNCTION public.revertir_anticipo_trx(
  p_anticipo_id uuid,
  p_asistente_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_asistente_id uuid;
  v_tipo text;
  v_monto numeric;
  v_fecha date;
  v_metodo_pago metodo_pago;
  v_notas text;
  v_monto_norm numeric;
  v_disponible numeric;
  v_disponible_norm numeric;
  v_reverso_id uuid;
  v_usuario_id uuid := auth.uid();
  v_nota_reverso text := format(
    '[REVERSO_ANTICIPO:%s] Reversion contable de anticipo gestionada desde el perfil del asistente.',
    p_anticipo_id
  );
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_asistente_id::text, 0));

  SELECT asistente_id, tipo, monto, fecha, metodo_pago, notas
  INTO v_asistente_id, v_tipo, v_monto, v_fecha, v_metodo_pago, v_notas
  FROM movimientos_saldo_favor
  WHERE id = p_anticipo_id
  FOR UPDATE;

  IF v_asistente_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo encontrar el anticipo a revertir.';
  END IF;
  IF v_asistente_id IS DISTINCT FROM p_asistente_id THEN
    RAISE EXCEPTION 'El anticipo no pertenece a este asistente.';
  END IF;
  IF v_tipo <> 'ingreso' THEN
    RAISE EXCEPTION 'Solo se pueden revertir anticipos que representen ingreso real a saldo a favor.';
  END IF;
  IF v_notas ILIKE '%[ANULADO]%' THEN
    RAISE EXCEPTION 'Este anticipo ya fue revertido anteriormente.';
  END IF;

  -- Normalizacion COP (igual que normalizarCopUsable / aplicar_saldo_favor_trx_impl).
  v_monto_norm := floor(greatest(
    CASE WHEN abs(round(v_monto) - v_monto) <= 0.05 THEN round(v_monto) ELSE floor(v_monto) END,
    0
  ) / 50) * 50;

  SELECT COALESCE(SUM(
    CASE WHEN tipo = 'ingreso' THEN monto WHEN tipo = 'aplicacion' THEN -monto ELSE 0 END
  ), 0)
  INTO v_disponible
  FROM movimientos_saldo_favor
  WHERE asistente_id = p_asistente_id;

  v_disponible_norm := floor(greatest(
    CASE WHEN abs(round(v_disponible) - v_disponible) <= 0.05 THEN round(v_disponible) ELSE floor(v_disponible) END,
    0
  ) / 50) * 50;

  IF v_disponible_norm < v_monto_norm THEN
    RAISE EXCEPTION 'No se puede revertir este anticipo porque el saldo a favor disponible ya no alcanza. Parte o todo del anticipo ya fue consumido.';
  END IF;

  -- Marca el ingreso original como anulado (no cuenta como ingreso real).
  UPDATE movimientos_saldo_favor
  SET notas = btrim('[ANULADO] ' || COALESCE(v_notas, '')),
      usuario_id = v_usuario_id
  WHERE id = p_anticipo_id;

  -- Aplicacion compensatoria: neutraliza el saldo disponible (que se calcula
  -- sin filtrar anulados) por el monto del anticipo revertido.
  INSERT INTO movimientos_saldo_favor (
    asistente_id, tipo, monto, fecha, metodo_pago, notas, usuario_id
  )
  VALUES (
    p_asistente_id, 'aplicacion', v_monto_norm, v_fecha,
    COALESCE(v_metodo_pago, 'saldo_a_favor'), v_nota_reverso, v_usuario_id
  )
  RETURNING id INTO v_reverso_id;

  INSERT INTO auditoria_financiera (
    tabla_afectada, registro_id, usuario_id, accion, valor_anterior, valor_nuevo, motivo
  )
  VALUES
    ('movimientos_saldo_favor', p_anticipo_id, v_usuario_id, 'revertir_anticipo', v_monto_norm, 0,
      'Anticipo anulado contablemente desde el perfil del asistente.'),
    ('movimientos_saldo_favor', v_reverso_id, v_usuario_id, 'reversion_anticipo_compensatoria', NULL, v_monto_norm,
      v_nota_reverso);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revertir_anticipo_trx(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revertir_anticipo_trx(uuid, uuid) TO authenticated, service_role;
