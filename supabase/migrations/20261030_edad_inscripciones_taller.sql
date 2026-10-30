-- La edad de quien se inscribe en un taller (pedido de Sebastián, 30 oct 2026,
-- para la Cena de la Gratitud, a la que también van menores con tarjeta de
-- identidad). Años cumplidos, de 0 a 120. Es opcional: las inscripciones de
-- antes quedan sin dato y nada de lo que ya existe cambia.

alter table public.taller_inscripciones
  add column if not exists edad smallint;

alter table public.taller_inscripciones
  drop constraint if exists taller_inscripciones_edad_valida;
alter table public.taller_inscripciones
  add constraint taller_inscripciones_edad_valida check (edad is null or edad between 0 and 120);

comment on column public.taller_inscripciones.edad is 'Años cumplidos al inscribirse (0 a 120). Opcional.';
