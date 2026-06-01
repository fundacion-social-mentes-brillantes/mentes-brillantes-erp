ALTER TABLE public.cuentas_por_cobrar
DROP CONSTRAINT IF EXISTS cuentas_por_cobrar_valor_total_check;

ALTER TABLE public.cuentas_por_cobrar
ADD CONSTRAINT cuentas_por_cobrar_valor_total_check
CHECK (valor_total >= 0);
