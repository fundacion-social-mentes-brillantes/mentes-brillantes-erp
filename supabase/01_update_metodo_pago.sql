-- 1. Renombrar el ENUM actual
ALTER TYPE metodo_pago RENAME TO metodo_pago_old;

-- 2. Crear el nuevo ENUM con los valores correctos
CREATE TYPE metodo_pago AS ENUM ('efectivo', 'nequi', 'daviplata', 'otro');

-- 3. Actualizar la tabla pagos_abonos
-- Mapea 'transferencia' y 'tarjeta' a 'otro', y mantiene 'efectivo' y 'otro'
ALTER TABLE pagos_abonos 
  ALTER COLUMN metodo_pago TYPE metodo_pago 
  USING (
    CASE 
      WHEN metodo_pago::text = 'transferencia' THEN 'otro'::metodo_pago
      WHEN metodo_pago::text = 'tarjeta' THEN 'otro'::metodo_pago
      ELSE metodo_pago::text::metodo_pago 
    END
  );

-- 4. Actualizar la tabla egresos
-- Mapea 'transferencia' y 'tarjeta' a 'otro', y mantiene 'efectivo' y 'otro'
ALTER TABLE egresos 
  ALTER COLUMN metodo_pago TYPE metodo_pago 
  USING (
    CASE 
      WHEN metodo_pago::text = 'transferencia' THEN 'otro'::metodo_pago
      WHEN metodo_pago::text = 'tarjeta' THEN 'otro'::metodo_pago
      ELSE metodo_pago::text::metodo_pago 
    END
  );

-- 5. Eliminar el ENUM antiguo
DROP TYPE metodo_pago_old;
