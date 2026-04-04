CREATE TABLE IF NOT EXISTS public.liquidaciones_resumen_cuentas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id UUID NOT NULL REFERENCES public.periodos(id) ON DELETE CASCADE,
  metodo_pago public.metodo_pago NOT NULL,
  total_ingresos NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_salidas NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_neto_periodo NUMERIC(12,2) NOT NULL DEFAULT 0,
  ingresos_abonos NUMERIC(12,2) NOT NULL DEFAULT 0,
  ingresos_donaciones NUMERIC(12,2) NOT NULL DEFAULT 0,
  salidas_egresos NUMERIC(12,2) NOT NULL DEFAULT 0,
  salidas_adelantos NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_liquidaciones_resumen_cuentas_periodo_metodo
  ON public.liquidaciones_resumen_cuentas (periodo_id, metodo_pago);
