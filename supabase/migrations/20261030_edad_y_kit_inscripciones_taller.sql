-- La edad y el kit de quien se inscribe en un taller (pedidos de Sebastián del
-- 30 oct 2026, para la Cena de la Gratitud, a la que también van menores con
-- tarjeta de identidad o registro civil).
-- - edad: años cumplidos, de 0 a 120.
-- - kit: si va con el kit especial del taller (true) o sin él (false), para saber
--   en la puerta quién lo lleva.
-- Las dos son opcionales: las inscripciones de antes quedan sin dato y nada de
-- lo que ya existe cambia.

alter table public.taller_inscripciones
  add column if not exists edad smallint,
  add column if not exists kit boolean;

alter table public.taller_inscripciones
  drop constraint if exists taller_inscripciones_edad_valida;
alter table public.taller_inscripciones
  add constraint taller_inscripciones_edad_valida check (edad is null or edad between 0 and 120);

comment on column public.taller_inscripciones.edad is 'Años cumplidos al inscribirse (0 a 120). Opcional.';
comment on column public.taller_inscripciones.kit is 'true: va con el kit del taller; false: sin kit; null: no se sabe.';
