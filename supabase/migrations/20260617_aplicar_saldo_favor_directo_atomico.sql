-- Aplicacion de saldo a favor desde el detalle de cuenta, de forma ATOMICA.
--
-- Contexto: la server action aplicarSaldoFavor hacia dos inserts separados
-- (pagos_abonos + movimientos_saldo_favor) con un UPDATE de estado y rollback
-- manual. Ante una falla parcial podia quedar un pago huerfano o el saldo sin
-- descontar (riesgo de doble uso del saldo a favor).
--
-- Esta migracion es ADITIVA y NO destructiva:
-- - No hace DROP de nada, no borra datos ni migraciones previas.
-- - No cambia RLS, roles, usuarios ni autenticacion.
-- - La funcion es SECURITY INVOKER: la RLS existente sigue gobernando los
--   INSERT/UPDATE (las politicas actuales ya permiten a admin y caja), por lo
--   que el modelo de permisos queda intacto. La autorizacion de la accion se
--   mantiene en la capa de server action (requireRoles(['admin','caja'])).
--
-- Atomicidad: todo el cuerpo corre dentro de una sola transaccion; si cualquier
-- validacion lanza EXCEPTION, no se inserta nada (sin pagos huerfanos). Ademas
-- se toma un lock por asistente (pg_advisory_xact_lock) para serializar
-- aplicaciones concurrentes del MISMO saldo a favor sobre cuentas distintas,
-- y se revalida el disponible dentro de la transaccion (evita el doble uso).

CREATE OR REPLACE FUNCTION public.aplicar_saldo_favor_directo(
  p_cuenta_id uuid,
  p_asistente_id uuid,
  p_monto numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cuenta_asistente_id uuid;
  v_valor_total numeric;
  v_total_abonado numeric;
  v_pendiente numeric;
  v_saldo_disponible numeric;
  v_pago_id uuid;
  v_movimiento_id uuid;
  v_usuario_id uuid := auth.uid();
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0.';
  END IF;

  -- Serializa todas las operaciones de saldo a favor de este asistente dentro
  -- de la transaccion: evita que dos aplicaciones concurrentes a cuentas
  -- distintas consuman el mismo saldo (doble uso).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_asistente_id::text, 0));

  -- Bloquea la cuenta para lecturas consistentes.
  SELECT asistente_id, valor_total
  INTO v_cuenta_asistente_id, v_valor_total
  FROM cuentas_por_cobrar
  WHERE id = p_cuenta_id
  FOR UPDATE;

  IF v_valor_total IS NULL THEN
    RAISE EXCEPTION 'Cuenta no encontrada.';
  END IF;

  IF v_cuenta_asistente_id IS DISTINCT FROM p_asistente_id THEN
    RAISE EXCEPTION 'La cuenta no pertenece al asistente indicado.';
  END IF;

  -- Pendiente real: solo pagos validos (no anulados por estado ni por nota).
  SELECT COALESCE(SUM(monto), 0)
  INTO v_total_abonado
  FROM pagos_abonos
  WHERE cuenta_id = p_cuenta_id
    AND COALESCE(estado, 'activo') <> 'anulado'
    AND (notas IS NULL OR notas NOT ILIKE '%[ANULADO]%');

  v_pendiente := GREATEST(v_valor_total - v_total_abonado, 0);

  IF p_monto > v_pendiente THEN
    RAISE EXCEPTION 'El monto excede el saldo pendiente de la cuenta.';
  END IF;

  -- Disponible real del asistente (ingreso - aplicacion), revalidado dentro de
  -- la transaccion ya serializada por el advisory lock.
  SELECT COALESCE(SUM(
    CASE
      WHEN tipo = 'ingreso' THEN monto
      WHEN tipo = 'aplicacion' THEN -monto
      ELSE 0
    END
  ), 0)
  INTO v_saldo_disponible
  FROM movimientos_saldo_favor
  WHERE asistente_id = p_asistente_id;

  IF p_monto > v_saldo_disponible THEN
    RAISE EXCEPTION 'El monto excede el saldo a favor disponible del asistente.';
  END IF;

  -- Pago espejo aplicado a la cuenta.
  INSERT INTO pagos_abonos (
    cuenta_id, monto, metodo_pago, origen_fondos, fecha_pago, notas, usuario_id
  )
  VALUES (
    p_cuenta_id, p_monto, 'saldo_a_favor', 'saldo_a_favor', CURRENT_DATE,
    'Aplicacion de saldo a favor', v_usuario_id
  )
  RETURNING id INTO v_pago_id;

  -- Consumo del saldo a favor.
  INSERT INTO movimientos_saldo_favor (
    asistente_id, cuenta_id, tipo, monto, metodo_pago, fecha, notas, usuario_id
  )
  VALUES (
    p_asistente_id, p_cuenta_id, 'aplicacion', p_monto, 'saldo_a_favor', CURRENT_DATE,
    format('Aplicacion de saldo a favor a la cuenta %s', p_cuenta_id), v_usuario_id
  )
  RETURNING id INTO v_movimiento_id;

  -- Estado de la cuenta (el trigger trg_estado_cuenta tambien lo recalcula;
  -- aqui se deja explicito para no depender del trigger).
  UPDATE cuentas_por_cobrar
  SET estado = CASE
    WHEN (v_total_abonado + p_monto) >= v_valor_total THEN 'pagado'::estado_cuenta
    WHEN (v_total_abonado + p_monto) > 0 THEN 'parcial'::estado_cuenta
    ELSE 'pendiente'::estado_cuenta
  END
  WHERE id = p_cuenta_id;

  -- Auditoria financiera (misma intencion que el flujo anterior).
  INSERT INTO auditoria_financiera (
    tabla_afectada, registro_id, usuario_id, accion, valor_anterior, valor_nuevo, motivo
  )
  VALUES
    ('pagos_abonos', v_pago_id, v_usuario_id, 'aplicar_saldo_a_favor', NULL, p_monto, 'Pago aplicado desde saldo a favor'),
    ('movimientos_saldo_favor', v_movimiento_id, v_usuario_id, 'consumir_saldo_a_favor', NULL, p_monto, 'Aplicacion de saldo a favor a una cuenta');
END;
$$;

-- Acceso: callable por usuarios autenticados (la RLS y la server action gobiernan
-- quien puede aplicar). No se otorga a anon. No modifica politicas existentes.
REVOKE EXECUTE ON FUNCTION public.aplicar_saldo_favor_directo(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_saldo_favor_directo(uuid, uuid, numeric) TO authenticated, service_role;
