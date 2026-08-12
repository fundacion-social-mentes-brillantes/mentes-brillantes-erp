-- Devoluciones de adelantos a socios.
--
-- Un adelanto que el socio devuelve (completo o por partes) es el mismo
-- movimiento con el signo contrario: vive en la misma tabla, con
-- tipo='devolucion', monto negativo y apuntando al adelanto que devuelve.
--
-- Se hizo asi a proposito. TODO lo que suma adelantos hace SUM(monto): el
-- cierre en fn_cerrar_liquidacion_impl (dos veces: salidas por metodo de pago
-- y adelantos_descontados por socio), el resumen por cuenta, la proyeccion por
-- socio y los exportes. Con el signo dentro del monto la devolucion se
-- descuenta sola en todas partes y NO hay que tocar el cierre, que es la
-- operacion de mayor riesgo del sistema.

alter table adelantos_socios
  add column if not exists tipo text not null default 'adelanto';

alter table adelantos_socios
  add column if not exists adelanto_id uuid references adelantos_socios(id) on delete restrict;

alter table adelantos_socios drop constraint if exists adelantos_socios_monto_check;
alter table adelantos_socios drop constraint if exists adelantos_socios_tipo_check;
alter table adelantos_socios drop constraint if exists adelantos_socios_devolucion_check;

alter table adelantos_socios
  add constraint adelantos_socios_tipo_check
  check (tipo in ('adelanto', 'devolucion'));

-- El adelanto entrega plata (positivo); la devolucion la regresa (negativo).
alter table adelantos_socios
  add constraint adelantos_socios_monto_check
  check ((tipo = 'adelanto' and monto > 0) or (tipo = 'devolucion' and monto < 0));

-- Una devolucion siempre dice de cual adelanto sale; un adelanto no apunta a nada.
alter table adelantos_socios
  add constraint adelantos_socios_devolucion_check
  check ((tipo = 'adelanto' and adelanto_id is null) or (tipo = 'devolucion' and adelanto_id is not null));

create index if not exists idx_adelantos_devolucion_ref
  on adelantos_socios (adelanto_id) where adelanto_id is not null;

comment on column adelantos_socios.tipo is
  'adelanto = plata entregada al socio (monto > 0). devolucion = plata que el socio regresa (monto < 0, apunta al adelanto).';
