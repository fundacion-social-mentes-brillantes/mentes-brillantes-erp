-- Alineacion integral del contrato BD-codigo contable
-- - agrega columnas faltantes usadas por el codigo
-- - crea objetos faltantes del contrato actual
-- - corrige vistas/funciones para anulados, saldo a favor y liquidacion

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'metodo_pago'
      AND e.enumlabel = 'saldo_a_favor'
  ) THEN
    ALTER TYPE metodo_pago ADD VALUE 'saldo_a_favor';
  END IF;
END
$$;

ALTER TABLE pagos_abonos
  ADD COLUMN IF NOT EXISTS origen_fondos TEXT NOT NULL DEFAULT 'pago_directo',
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activo',
  ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES auth.users(id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'coach_paquetes'
  ) THEN
    EXECUTE 'ALTER TABLE coach_paquetes DROP COLUMN IF EXISTS valor_total';
  END IF;
END
$$;

ALTER TABLE pagos_abonos
  DROP CONSTRAINT IF EXISTS pagos_abonos_origen_fondos_check;

ALTER TABLE pagos_abonos
  ADD CONSTRAINT pagos_abonos_origen_fondos_check
  CHECK (origen_fondos IN ('pago_directo', 'saldo_a_favor'));

ALTER TABLE pagos_abonos
  DROP CONSTRAINT IF EXISTS pagos_abonos_estado_check;

ALTER TABLE pagos_abonos
  ADD CONSTRAINT pagos_abonos_estado_check
  CHECK (estado IN ('activo', 'anulado'));

UPDATE pagos_abonos
SET origen_fondos = COALESCE(origen_fondos, 'pago_directo'),
    estado = COALESCE(estado, 'activo');

ALTER TABLE egresos
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activo',
  ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES auth.users(id);

ALTER TABLE egresos
  DROP CONSTRAINT IF EXISTS egresos_estado_check;

ALTER TABLE egresos
  ADD CONSTRAINT egresos_estado_check
  CHECK (estado IN ('activo', 'anulado'));

UPDATE egresos
SET estado = COALESCE(estado, 'activo');

ALTER TABLE donaciones_asistentes
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activo',
  ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES auth.users(id);

ALTER TABLE donaciones_asistentes
  DROP CONSTRAINT IF EXISTS donaciones_asistentes_estado_check;

ALTER TABLE donaciones_asistentes
  ADD CONSTRAINT donaciones_asistentes_estado_check
  CHECK (estado IN ('activo', 'anulado'));

UPDATE donaciones_asistentes
SET estado = COALESCE(estado, 'activo');

CREATE TABLE IF NOT EXISTS movimientos_saldo_favor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asistente_id UUID NOT NULL REFERENCES asistentes(id) ON DELETE RESTRICT,
  cuenta_id UUID REFERENCES cuentas_por_cobrar(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'aplicacion')),
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  metodo_pago metodo_pago NOT NULL DEFAULT 'otro',
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  notas TEXT,
  usuario_id UUID REFERENCES auth.users(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS liquidaciones_resumen_cuentas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id UUID NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
  metodo_pago metodo_pago NOT NULL,
  total_ingresos NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_salidas NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_neto_periodo NUMERIC(12,2) NOT NULL DEFAULT 0,
  ingresos_abonos NUMERIC(12,2) NOT NULL DEFAULT 0,
  ingresos_donaciones NUMERIC(12,2) NOT NULL DEFAULT 0,
  salidas_egresos NUMERIC(12,2) NOT NULL DEFAULT 0,
  salidas_adelantos NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (periodo_id, metodo_pago)
);

CREATE TABLE IF NOT EXISTS auditoria_financiera (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla_afectada TEXT NOT NULL,
  registro_id UUID NOT NULL,
  usuario_id UUID REFERENCES auth.users(id),
  accion TEXT NOT NULL,
  valor_anterior NUMERIC(12,2),
  valor_nuevo NUMERIC(12,2),
  motivo TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS configuracion_empresa (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  nit TEXT,
  correo TEXT,
  telefono TEXT,
  ciudad TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO configuracion_empresa (id, nombre)
VALUES (1, 'Fundacion Social Gimnasio Emocional Mentes Brillantes')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE VIEW vista_cuentas_saldos AS
SELECT
  c.id,
  c.asistente_id,
  c.valor_total,
  COALESCE(SUM(p.monto), 0) AS total_abonado,
  GREATEST(c.valor_total - COALESCE(SUM(p.monto), 0), 0) AS monto_pendiente,
  c.estado
FROM cuentas_por_cobrar c
LEFT JOIN pagos_abonos p
  ON c.id = p.cuenta_id
 AND COALESCE(p.estado, 'activo') <> 'anulado'
 AND (p.notas IS NULL OR p.notas NOT ILIKE '%[ANULADO]%')
GROUP BY c.id;

CREATE OR REPLACE FUNCTION actualizar_estado_cuenta()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_cuenta_id UUID;
  v_total NUMERIC;
  v_abonado NUMERIC;
BEGIN
  v_cuenta_id := COALESCE(NEW.cuenta_id, OLD.cuenta_id);
  IF v_cuenta_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT valor_total INTO v_total
  FROM cuentas_por_cobrar
  WHERE id = v_cuenta_id;

  SELECT COALESCE(SUM(monto), 0) INTO v_abonado
  FROM pagos_abonos
  WHERE cuenta_id = v_cuenta_id
    AND COALESCE(estado, 'activo') <> 'anulado'
    AND (notas IS NULL OR notas NOT ILIKE '%[ANULADO]%');

  UPDATE cuentas_por_cobrar
  SET estado = CASE
    WHEN v_abonado >= v_total THEN 'pagado'::estado_cuenta
    WHEN v_abonado > 0 THEN 'parcial'::estado_cuenta
    ELSE 'pendiente'::estado_cuenta
  END
  WHERE id = v_cuenta_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_estado_cuenta ON pagos_abonos;
CREATE TRIGGER trg_estado_cuenta
AFTER INSERT OR UPDATE OR DELETE ON pagos_abonos
FOR EACH ROW EXECUTE FUNCTION actualizar_estado_cuenta();

CREATE OR REPLACE VIEW vw_movimientos_generales AS
SELECT
  c.id AS movimiento_id,
  c.fecha_emision AS fecha,
  'cuenta_cobrar' AS tipo_movimiento,
  c.asistente_id,
  a.nombre AS asistente_nombre,
  c.concepto,
  NULL::metodo_pago AS metodo_pago,
  GREATEST(
    c.valor_total - COALESCE((
      SELECT SUM(pa.monto)
      FROM pagos_abonos pa
      WHERE pa.cuenta_id = c.id
        AND COALESCE(pa.estado, 'activo') <> 'anulado'
        AND (pa.notas IS NULL OR pa.notas NOT ILIKE '%[ANULADO]%')
    ), 0),
    0
  ) AS valor_deuda,
  0::NUMERIC(12,2) AS valor_ingreso,
  0::NUMERIC(12,2) AS valor_egreso,
  c.estado::TEXT AS estado_o_saldo,
  NULL::TEXT AS notas,
  c.creado_en,
  NULL::TEXT AS categoria
FROM cuentas_por_cobrar c
LEFT JOIN asistentes a ON a.id = c.asistente_id

UNION ALL

SELECT
  p.id,
  p.fecha_pago,
  'abono',
  c.asistente_id,
  a.nombre,
  c.concepto,
  p.metodo_pago,
  0::NUMERIC(12,2),
  CASE
    WHEN COALESCE(p.estado, 'activo') <> 'anulado'
      AND (p.notas IS NULL OR p.notas NOT ILIKE '%[ANULADO]%')
      AND COALESCE(LOWER(p.origen_fondos), '') <> 'saldo_a_favor'
      AND COALESCE(LOWER(p.metodo_pago::TEXT), '') <> 'saldo_a_favor'
    THEN p.monto
    ELSE 0
  END,
  0::NUMERIC(12,2),
  p.estado,
  p.notas,
  p.creado_en,
  NULL::TEXT
FROM pagos_abonos p
LEFT JOIN cuentas_por_cobrar c ON c.id = p.cuenta_id
LEFT JOIN asistentes a ON a.id = c.asistente_id

UNION ALL

SELECT
  msf.id,
  msf.fecha,
  CASE WHEN msf.tipo = 'ingreso' THEN 'anticipo' ELSE 'aplicacion_saldo' END,
  msf.asistente_id,
  a.nombre,
  COALESCE(msf.notas, 'Saldo a favor'),
  msf.metodo_pago,
  0::NUMERIC(12,2),
  CASE WHEN msf.tipo = 'ingreso' THEN msf.monto ELSE 0 END,
  CASE WHEN msf.tipo = 'aplicacion' THEN msf.monto ELSE 0 END,
  msf.tipo,
  msf.notas,
  msf.creado_en,
  NULL::TEXT
FROM movimientos_saldo_favor msf
LEFT JOIN asistentes a ON a.id = msf.asistente_id

UNION ALL

SELECT
  e.id,
  e.fecha,
  'egreso',
  NULL::UUID,
  NULL::TEXT,
  e.concepto,
  e.metodo_pago,
  0::NUMERIC(12,2),
  0::NUMERIC(12,2),
  CASE
    WHEN COALESCE(e.estado, 'activo') <> 'anulado'
      AND (e.notas IS NULL OR e.notas NOT ILIKE '%[ANULADO]%')
    THEN e.monto
    ELSE 0
  END,
  e.estado,
  e.notas,
  e.creado_en,
  e.categoria
FROM egresos e

UNION ALL

SELECT
  d.id,
  d.fecha,
  'donacion',
  d.asistente_id,
  a.nombre,
  'Donacion',
  d.metodo_pago,
  0::NUMERIC(12,2),
  CASE
    WHEN COALESCE(d.estado, 'activo') <> 'anulado'
      AND (d.notas IS NULL OR d.notas NOT ILIKE '%[ANULADO]%')
    THEN d.monto
    ELSE 0
  END,
  0::NUMERIC(12,2),
  d.estado,
  d.notas,
  d.creado_en,
  NULL::TEXT
FROM donaciones_asistentes d
LEFT JOIN asistentes a ON a.id = d.asistente_id;

CREATE OR REPLACE FUNCTION aplicar_saldo_favor_trx(
  p_cuenta_id UUID,
  p_asistente_id UUID,
  p_monto NUMERIC
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_fecha DATE := CURRENT_DATE;
  v_periodo_nombre TEXT;
  v_periodo_estado TEXT;
  v_valor_total NUMERIC;
  v_total_abonado NUMERIC;
  v_pendiente NUMERIC;
  v_pago_id UUID;
  v_movimiento_id UUID;
  v_usuario_id UUID := auth.uid();
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0.';
  END IF;

  SELECT nombre, estado::TEXT
  INTO v_periodo_nombre, v_periodo_estado
  FROM periodos
  WHERE v_fecha BETWEEN fecha_inicio AND fecha_fin
  ORDER BY fecha_inicio DESC
  LIMIT 1;

  IF v_periodo_estado = 'cerrado' THEN
    RAISE EXCEPTION 'Aplicar saldo a favor no se puede realizar porque la fecha % pertenece al periodo cerrado %.', v_fecha, v_periodo_nombre;
  END IF;

  SELECT valor_total
  INTO v_valor_total
  FROM cuentas_por_cobrar
  WHERE id = p_cuenta_id
  FOR UPDATE;

  IF v_valor_total IS NULL THEN
    RAISE EXCEPTION 'Cuenta no encontrada.';
  END IF;

  SELECT COALESCE(SUM(monto), 0)
  INTO v_total_abonado
  FROM pagos_abonos
  WHERE cuenta_id = p_cuenta_id
    AND COALESCE(estado, 'activo') <> 'anulado'
    AND (notas IS NULL OR notas NOT ILIKE '%[ANULADO]%');

  v_pendiente := GREATEST(v_valor_total - v_total_abonado, 0);

  IF p_monto > v_pendiente THEN
    RAISE EXCEPTION 'El monto excede el saldo pendiente de la cuenta.';
  END IF;

  INSERT INTO pagos_abonos (
    cuenta_id,
    monto,
    metodo_pago,
    origen_fondos,
    fecha_pago,
    notas,
    usuario_id
  )
  VALUES (
    p_cuenta_id,
    p_monto,
    'saldo_a_favor',
    'saldo_a_favor',
    v_fecha,
    'Aplicacion de saldo a favor',
    v_usuario_id
  )
  RETURNING id INTO v_pago_id;

  INSERT INTO movimientos_saldo_favor (
    asistente_id,
    cuenta_id,
    tipo,
    monto,
    metodo_pago,
    fecha,
    notas,
    usuario_id
  )
  VALUES (
    p_asistente_id,
    p_cuenta_id,
    'aplicacion',
    p_monto,
    'saldo_a_favor',
    v_fecha,
    format('Aplicacion de saldo a favor a la cuenta %s', p_cuenta_id),
    v_usuario_id
  )
  RETURNING id INTO v_movimiento_id;

  INSERT INTO auditoria_financiera (
    tabla_afectada,
    registro_id,
    usuario_id,
    accion,
    valor_anterior,
    valor_nuevo,
    motivo
  )
  VALUES
    ('pagos_abonos', v_pago_id, v_usuario_id, 'aplicar_saldo_a_favor', NULL, p_monto, 'Pago aplicado desde saldo a favor'),
    ('movimientos_saldo_favor', v_movimiento_id, v_usuario_id, 'consumir_saldo_a_favor', NULL, p_monto, 'Aplicacion de saldo a favor a una cuenta');
END;
$$;
