-- Variantes con usuario explicito para las dos RPC de reverso, por la misma
-- razon que aplicar_saldo_favor_directo: desde el MCP se entra como
-- service_role y auth.uid() es NULL, asi que la auditoria quedaba sin autor.
-- Candado: solo service_role puede indicar el autor.

create or replace function public.revertir_abono_con_saldo_trx(
  p_abono_id uuid, p_cuenta_id uuid, p_usuario_id uuid
)
returns void
language plpgsql
set search_path to 'public'
as $function$
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
  v_usuario_id uuid := CASE WHEN auth.role() = 'service_role' THEN p_usuario_id ELSE auth.uid() END;
  v_nota_reverso text := format(
    '[REVERSO_ABONO:%s] Reverso de saldo a favor por anulacion del abono con sobrepago.',
    p_abono_id
  );
BEGIN
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

  UPDATE pagos_abonos
  SET estado = 'anulado',
      notas = btrim('[ANULADO] ' || COALESCE(v_abono_notas, ''))
  WHERE id = p_abono_id;

  IF v_overflow > 0 THEN
    UPDATE movimientos_saldo_favor
    SET notas = btrim('[ANULADO] ' || COALESCE(notas, ''))
    WHERE cuenta_id = p_cuenta_id
      AND tipo = 'ingreso'
      AND notas ILIKE '%[ABONO:' || p_abono_id::text || ']%'
      AND notas NOT ILIKE '%[ANULADO]%';

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
$function$;

create or replace function public.revertir_abono_con_saldo_trx(p_abono_id uuid, p_cuenta_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $function$
BEGIN
  PERFORM public.revertir_abono_con_saldo_trx(p_abono_id, p_cuenta_id, auth.uid());
END;
$function$;

create or replace function public.revertir_anticipo_trx(
  p_anticipo_id uuid, p_asistente_id uuid, p_usuario_id uuid
)
returns void
language plpgsql
set search_path to 'public'
as $function$
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
  v_usuario_id uuid := CASE WHEN auth.role() = 'service_role' THEN p_usuario_id ELSE auth.uid() END;
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

  UPDATE movimientos_saldo_favor
  SET notas = btrim('[ANULADO] ' || COALESCE(v_notas, '')),
      usuario_id = v_usuario_id
  WHERE id = p_anticipo_id;

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
$function$;

create or replace function public.revertir_anticipo_trx(p_anticipo_id uuid, p_asistente_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $function$
BEGIN
  PERFORM public.revertir_anticipo_trx(p_anticipo_id, p_asistente_id, auth.uid());
END;
$function$;

grant execute on function public.revertir_abono_con_saldo_trx(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.revertir_abono_con_saldo_trx(uuid, uuid) to authenticated, service_role;
grant execute on function public.revertir_anticipo_trx(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.revertir_anticipo_trx(uuid, uuid) to authenticated, service_role;
