ALTER TABLE public.auditoria_financiera
  ALTER COLUMN valor_anterior DROP NOT NULL;

ALTER TABLE public.auditoria_financiera
  ALTER COLUMN valor_nuevo DROP NOT NULL;
