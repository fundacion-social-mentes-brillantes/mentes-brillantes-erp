-- Deshacer un pago hecho con saldo a favor (2026-10-17).
--
-- Hasta hoy un pago hecho con saldo a favor no se podia anular: si solo se
-- anulaba el pago, el saldo que se desconto no volvia a la persona. Esta
-- funcion lo hace completo y en una sola transaccion:
--   1. el pago queda ANULADO (la deuda de la cuenta vuelve a subir; el
--      disparador trg_estado_cuenta recalcula el estado de la cuenta);
--   2. el descuento de saldo que nacio con ese pago se marca [ANULADO] (solo
--      etiqueta: el saldo se calcula como ingresos menos aplicaciones);
--   3. entra un "ingreso" compensatorio por el monto ACTUAL del pago (si el
--      monto se corrigio, los ajustes [ABONO:id] ya movieron el saldo), con
--      metodo_pago = 'saldo_a_favor', que nunca cuenta como ingreso nuevo
--      (esIngresoRealSaldoAFavor y fn_cerrar_liquidacion_impl);
--   4. queda en la auditoria.
--
-- Solo deshace pagos cuyo descuento de saldo existe: la RPC que aplica saldo
-- (aplicar_saldo_favor_directo) crea el pago y el descuento en la misma
-- transaccion, con la misma cuenta y la misma hora. Los pagos de la carga
-- inicial (13-mar-2026) no tienen ese descuento; deshacerlos inventaria saldo,
-- asi que se rechazan.
--
-- Como los otros reversos: SECURITY INVOKER (las reglas de las tablas deciden
-- quien puede: anular pagos es solo de admin) y el autor explicito cuando
-- llama el servidor o el MCP (service_role, donde auth.uid() es NULL).

create or replace function public.revertir_pago_con_saldo_trx(p_abono_id uuid, p_usuario_id uuid, p_motivo text default null)
returns numeric
language plpgsql
set search_path to 'public'
as $function$
declare
  v_abono record;
  v_asistente_id uuid;
  v_aplicacion_id uuid;
  v_reverso_id uuid;
  v_marca text := format('[REVERSO_PAGO_SALDO:%s]', p_abono_id);
  v_usuario_id uuid := case when auth.role() = 'service_role' then p_usuario_id else auth.uid() end;
begin
  select id, cuenta_id, monto, estado, notas, origen_fondos, metodo_pago::text as metodo, fecha_pago, creado_en
    into v_abono
    from pagos_abonos
   where id = p_abono_id
     for update;
  if v_abono.id is null then
    raise exception 'No se encontró el pago.';
  end if;
  if coalesce(v_abono.origen_fondos, '') <> 'saldo_a_favor' and coalesce(v_abono.metodo, '') <> 'saldo_a_favor' then
    raise exception 'Ese pago no se hizo con saldo a favor.';
  end if;
  if coalesce(v_abono.estado, 'activo') = 'anulado' or coalesce(v_abono.notas, '') ilike '%[ANULADO]%' then
    raise exception 'Ese pago ya está anulado.';
  end if;
  if coalesce(v_abono.monto, 0) <= 0 then
    raise exception 'El pago no tiene un monto válido.';
  end if;

  select asistente_id into v_asistente_id
    from cuentas_por_cobrar
   where id = v_abono.cuenta_id
     for update;
  if v_asistente_id is null then
    raise exception 'La cuenta de ese pago no tiene una persona asociada.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_asistente_id::text, 0));

  if exists (
    select 1 from movimientos_saldo_favor
     where asistente_id = v_asistente_id and position(v_marca in coalesce(notas, '')) > 0
  ) then
    raise exception 'Ese pago ya se había deshecho.';
  end if;

  -- El descuento de saldo que nacio con este pago: misma persona y cuenta,
  -- creado en la misma transaccion (las dos tablas guardan la hora con
  -- formulas distintas, por eso se toma el mas cercano dentro de 2 segundos).
  select id into v_aplicacion_id
    from movimientos_saldo_favor
   where asistente_id = v_asistente_id
     and cuenta_id = v_abono.cuenta_id
     and tipo = 'aplicacion'
     and coalesce(notas, '') not ilike '%[ANULADO]%'
     and abs(extract(epoch from (creado_en - v_abono.creado_en))) < 2
   order by abs(extract(epoch from (creado_en - v_abono.creado_en))), id
   limit 1
     for update;
  if v_aplicacion_id is null then
    raise exception 'No encontré el descuento de saldo a favor de este pago (puede venir de la carga inicial). No se deshace, para no inventar saldo.';
  end if;

  update pagos_abonos
     set estado = 'anulado', notas = trim('[ANULADO] ' || coalesce(notas, ''))
   where id = p_abono_id;

  update movimientos_saldo_favor
     set notas = trim('[ANULADO] ' || coalesce(notas, ''))
   where id = v_aplicacion_id;

  insert into movimientos_saldo_favor (asistente_id, cuenta_id, tipo, monto, metodo_pago, fecha, notas, usuario_id)
  values (
    v_asistente_id, v_abono.cuenta_id, 'ingreso', v_abono.monto, 'saldo_a_favor', v_abono.fecha_pago,
    v_marca || ' Devolucion del saldo a favor por anulacion del pago hecho con saldo.', v_usuario_id
  )
  returning id into v_reverso_id;

  insert into auditoria_financiera (tabla_afectada, registro_id, usuario_id, accion, valor_anterior, valor_nuevo, motivo)
  values
    ('pagos_abonos', p_abono_id, v_usuario_id, 'anular_pago_con_saldo', v_abono.monto, 0,
     coalesce(nullif(trim(p_motivo), ''), 'Pago hecho con saldo a favor anulado; el saldo vuelve a la persona')),
    ('movimientos_saldo_favor', v_reverso_id, v_usuario_id, 'devolver_saldo_a_favor', null, v_abono.monto,
     'Devolucion del saldo a favor del pago anulado');

  return v_abono.monto;
end;
$function$;

revoke all on function public.revertir_pago_con_saldo_trx(uuid, uuid, text) from public, anon;
grant execute on function public.revertir_pago_con_saldo_trx(uuid, uuid, text) to authenticated, service_role;

-- Funciones que hasta un visitante anonimo podia llamar. Corren con los
-- permisos de quien llama, asi que las reglas de las tablas ya lo frenaban;
-- se cierran por orden. Los usuarios con sesion y el servidor conservan su
-- permiso propio (authenticated y service_role lo tienen explicito).
revoke execute on function public.aplicar_saldo_favor_directo(uuid, uuid, numeric, uuid) from public, anon;
revoke execute on function public.revertir_abono_con_saldo_trx(uuid, uuid, uuid) from public, anon;
revoke execute on function public.revertir_anticipo_trx(uuid, uuid, uuid) from public, anon;
