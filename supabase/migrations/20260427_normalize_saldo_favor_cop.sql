CREATE OR REPLACE FUNCTION aplicar_saldo_favor_trx(
  p_cuenta_id UUID,
  p_asistente_id UUID,
  p_monto NUMERIC
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_fecha DATE := CURRENT_DATE;
  v_periodo_nombre TEXT;
  v_periodo_estado TEXT;
  v_cuenta_asistente_id UUID;
  v_valor_total NUMERIC;
  v_total_abonado NUMERIC;
  v_pendiente NUMERIC;
  v_pendiente_usable NUMERIC;
  v_saldo_disponible NUMERIC;
  v_saldo_usable NUMERIC;
  v_pago_id UUID;
  v_movimiento_id UUID;
  v_usuario_id UUID := auth.uid();
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0.';
  END IF;

  IF p_monto <> FLOOR(p_monto) OR MOD(p_monto, 50) <> 0 THEN
    RAISE EXCEPTION 'El monto debe estar en pesos enteros y multiplos de 50.';
  END IF;

  SELECT nombre, estado::TEXT
  INTO v_periodo_nombre, v_periodo_estado
  FROM periodos
  WHERE v_fecha BETWEEN fecha_inicio AND fecha_fin
  ORDER BY fecha_inicio DESC
  LIMIT 1;

  IF v_periodo_estado = 'cerrado' THEN
    RAISE EXCEPTION 'Aplicar saldo a favor no se puede realizar porque la fecha % pertenece al periodo cerrado %.', v_fecha, v_periodo_nombre;
  END IF;

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

  SELECT COALESCE(SUM(monto), 0)
  INTO v_total_abonado
  FROM pagos_abonos
  WHERE cuenta_id = p_cuenta_id
    AND COALESCE(estado, 'activo') <> 'anulado'
    AND (notas IS NULL OR notas NOT ILIKE '%[ANULADO]%');

  v_pendiente := GREATEST(v_valor_total - v_total_abonado, 0);
  v_pendiente_usable := FLOOR(
    GREATEST(
      CASE
        WHEN ABS(ROUND(v_pendiente) - v_pendiente) <= 0.05 THEN ROUND(v_pendiente)
        ELSE FLOOR(v_pendiente)
      END,
      0
    ) / 50
  ) * 50;

  IF p_monto > v_pendiente_usable THEN
    RAISE EXCEPTION 'El monto excede el saldo pendiente de la cuenta.';
  END IF;

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

  v_saldo_usable := FLOOR(
    GREATEST(
      CASE
        WHEN ABS(ROUND(v_saldo_disponible) - v_saldo_disponible) <= 0.05 THEN ROUND(v_saldo_disponible)
        ELSE FLOOR(v_saldo_disponible)
      END,
      0
    ) / 50
  ) * 50;

  IF p_monto > v_saldo_usable THEN
    RAISE EXCEPTION 'El monto excede el saldo a favor disponible del asistente.';
  END IF;

  INSERT INTO pagos_abonos (
    cuenta_id,
    monto,
    metodo_pago,
    origen_fondos,
    fecha_pago,
    notas,
    usuario_id
  )
  VALUES (
    p_cuenta_id,
    p_monto,
    'saldo_a_favor',
    'saldo_a_favor',
    v_fecha,
    'Aplicacion de saldo a favor',
    v_usuario_id
  )
  RETURNING id INTO v_pago_id;

  INSERT INTO movimientos_saldo_favor (
    asistente_id,
    cuenta_id,
    tipo,
    monto,
    metodo_pago,
    fecha,
    notas,
    usuario_id
  )
  VALUES (
    p_asistente_id,
    p_cuenta_id,
    'aplicacion',
    p_monto,
    'saldo_a_favor',
    v_fecha,
    format('Aplicacion de saldo a favor a la cuenta %s', p_cuenta_id),
    v_usuario_id
  )
  RETURNING id INTO v_movimiento_id;

  INSERT INTO auditoria_financiera (
    tabla_afectada,
    registro_id,
    usuario_id,
    accion,
    valor_anterior,
    valor_nuevo,
    motivo
  )
  VALUES
    ('pagos_abonos', v_pago_id, v_usuario_id, 'aplicar_saldo_a_favor', NULL, p_monto, 'Pago aplicado desde saldo a favor'),
    ('movimientos_saldo_favor', v_movimiento_id, v_usuario_id, 'consumir_saldo_a_favor', NULL, p_monto, 'Aplicacion de saldo a favor a una cuenta');
END;
$$;
