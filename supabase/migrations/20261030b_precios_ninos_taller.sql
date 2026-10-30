-- Lo que pagan los niños en un taller según lleven kit o no (pedido de
-- Sebastián del 30 oct 2026 para la Cena de la Gratitud: niños hasta 15 años
-- sin kit gratis, con kit 60.000; desde los 16, el valor normal y con kit).
-- Las dos son opcionales: vacías, los niños pagan como todos (como hasta hoy).
-- La regla de quién es niño (hasta 15 años) está en el ERP (valorYKitDeInscripcion).

alter table public.talleres
  add column if not exists precio_nino_con_kit numeric(12,2),
  add column if not exists precio_nino_sin_kit numeric(12,2);

alter table public.talleres drop constraint if exists talleres_precios_ninos_validos;
alter table public.talleres
  add constraint talleres_precios_ninos_validos check (
    (precio_nino_con_kit is null and precio_nino_sin_kit is null)
    or (precio_nino_con_kit >= 0 and precio_nino_sin_kit >= 0)
  );

comment on column public.talleres.precio_nino_con_kit is 'Lo que paga un niño (hasta 15 años) que va con kit. Null: los niños pagan como todos.';
comment on column public.talleres.precio_nino_sin_kit is 'Lo que paga un niño (hasta 15 años) que va sin kit (0 = gratis). Null: los niños pagan como todos.';
