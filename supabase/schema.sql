-- supabase/schema.sql
-- Esquema base alineado con las reglas contables vigentes del ERP.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ENUMS
CREATE TYPE estado_cuenta AS ENUM ('pendiente', 'parcial', 'pagado');
CREATE TYPE metodo_pago AS ENUM ('efectivo', 'nequi', 'daviplata', 'otro', 'saldo_a_favor');
CREATE TYPE estado_periodo AS ENUM ('abierto', 'cerrado');
CREATE TYPE rol_usuario AS ENUM ('admin', 'caja', 'consulta');

-- ASISTENTES
CREATE TABLE asistentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_row_id TEXT UNIQUE,
  legacy_asistente_id TEXT,
  codigo TEXT,
  nombre TEXT NOT NULL,
  cedula TEXT UNIQUE,
  correo TEXT,
  telefono TEXT,
  fecha_registro DATE,
  fecha_inicio_proceso DATE,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX asistentes_codigo_unq ON asistentes (codigo) WHERE codigo IS NOT NULL;

-- PERFILES
CREATE TABLE perfiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  nombre TEXT NOT NULL,
  rol rol_usuario NOT NULL DEFAULT 'consulta',
  asistente_id UUID UNIQUE REFERENCES asistentes(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CUENTAS POR COBRAR
CREATE TABLE cuentas_por_cobrar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asistente_id UUID NOT NULL REFERENCES asistentes(id) ON DELETE RESTRICT,
  legacy_row_id TEXT UNIQUE,
  concepto TEXT NOT NULL,
  valor_total NUMERIC(12,2) NOT NULL CHECK (valor_total >= 0),
  fecha_emision DATE NOT NULL,
  estado estado_cuenta NOT NULL DEFAULT 'pendiente',
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cuentas_asistente_fecha ON cuentas_por_cobrar (asistente_id, fecha_emision DESC);
CREATE INDEX idx_cuentas_estado ON cuentas_por_cobrar (estado);

-- PAGOS / ABONOS
CREATE TABLE pagos_abonos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id UUID NOT NULL REFERENCES cuentas_por_cobrar(id) ON DELETE CASCADE,
  legacy_row_id TEXT UNIQUE,
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  metodo_pago metodo_pago NOT NULL,
  origen_fondos TEXT NOT NULL DEFAULT 'pago_directo' CHECK (origen_fondos IN ('pago_directo', 'saldo_a_favor')),
  fecha_pago DATE NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'anulado')),
  notas TEXT,
  usuario_id UUID REFERENCES auth.users(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pagos_cuenta_fecha ON pagos_abonos (cuenta_id, fecha_pago DESC);
CREATE INDEX idx_pagos_estado ON pagos_abonos (estado);
CREATE INDEX idx_pagos_fecha ON pagos_abonos (fecha_pago);

-- MOVIMIENTOS DE SALDO A FAVOR
CREATE TABLE movimientos_saldo_favor (
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

CREATE INDEX idx_msf_asistente_fecha ON movimientos_saldo_favor (asistente_id, fecha DESC);
CREATE INDEX idx_msf_cuenta ON movimientos_saldo_favor (cuenta_id);

-- EGRESOS
CREATE TABLE egresos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_row_id TEXT UNIQUE,
  concepto TEXT NOT NULL,
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  categoria TEXT NOT NULL,
  metodo_pago metodo_pago NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'anulado')),
  notas TEXT,
  usuario_id UUID REFERENCES auth.users(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_egresos_fecha ON egresos (fecha DESC);
CREATE INDEX idx_egresos_estado ON egresos (estado);

-- DONACIONES
CREATE TABLE donaciones_asistentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asistente_id UUID NOT NULL REFERENCES asistentes(id) ON DELETE RESTRICT,
  legacy_row_id TEXT UNIQUE,
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  metodo_pago metodo_pago NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'anulado')),
  notas TEXT,
  usuario_id UUID REFERENCES auth.users(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_donaciones_asistente_fecha ON donaciones_asistentes (asistente_id, fecha DESC);
CREATE INDEX idx_donaciones_estado ON donaciones_asistentes (estado);

-- VENTAS EXTERNAS
CREATE TABLE ventas_externas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_row_id TEXT UNIQUE,
  comprador_nombre TEXT,
  concepto TEXT NOT NULL,
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  metodo_pago metodo_pago NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'anulado')),
  notas TEXT,
  usuario_id UUID REFERENCES auth.users(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ventas_externas_fecha ON ventas_externas (fecha DESC);
CREATE INDEX idx_ventas_externas_estado ON ventas_externas (estado);

ALTER TABLE ventas_externas ENABLE ROW LEVEL SECURITY;

CREATE POLICY ventas_externas_select_roles
  ON ventas_externas
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM perfiles
      WHERE perfiles.id = auth.uid()
        AND perfiles.rol IN ('admin', 'caja', 'consulta')
    )
  );

CREATE POLICY ventas_externas_insert_admin_caja
  ON ventas_externas
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM perfiles
      WHERE perfiles.id = auth.uid()
        AND perfiles.rol IN ('admin', 'caja')
    )
  );

CREATE POLICY ventas_externas_update_admin
  ON ventas_externas
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM perfiles
      WHERE perfiles.id = auth.uid()
        AND perfiles.rol = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM perfiles
      WHERE perfiles.id = auth.uid()
        AND perfiles.rol = 'admin'
    )
  );

CREATE POLICY ventas_externas_delete_admin
  ON ventas_externas
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM perfiles
      WHERE perfiles.id = auth.uid()
        AND perfiles.rol = 'admin'
    )
  );

-- COACH
CREATE TABLE coach_paquetes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id UUID NOT NULL UNIQUE REFERENCES cuentas_por_cobrar(id) ON DELETE CASCADE,
  asistente_id UUID NOT NULL REFERENCES asistentes(id) ON DELETE RESTRICT,
  sesiones_compradas INTEGER NOT NULL CHECK (sesiones_compradas > 0),
  notas TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coach_paquetes_asistente ON coach_paquetes (asistente_id);

CREATE TABLE coach_sesiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paquete_id UUID NOT NULL REFERENCES coach_paquetes(id) ON DELETE CASCADE,
  asistente_id UUID NOT NULL REFERENCES asistentes(id) ON DELETE RESTRICT,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  notas TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coach_sesiones_paquete ON coach_sesiones (paquete_id);
CREATE INDEX idx_coach_sesiones_asistente ON coach_sesiones (asistente_id);

-- SOCIOS Y PERIODOS
CREATE TABLE socios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES perfiles(id),
  legacy_row_id TEXT UNIQUE,
  nombre TEXT NOT NULL,
  porcentaje_participacion NUMERIC(5,2) NOT NULL CHECK (porcentaje_participacion >= 0 AND porcentaje_participacion <= 100),
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE periodos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_row_id TEXT UNIQUE,
  nombre TEXT NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  estado estado_periodo NOT NULL DEFAULT 'abierto',
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (fecha_inicio <= fecha_fin)
);

CREATE INDEX idx_periodos_rango ON periodos (fecha_inicio, fecha_fin);
CREATE INDEX idx_periodos_estado ON periodos (estado);

CREATE TABLE adelantos_socios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id UUID NOT NULL REFERENCES socios(id) ON DELETE RESTRICT,
  periodo_id UUID NOT NULL REFERENCES periodos(id) ON DELETE RESTRICT,
  legacy_row_id TEXT UNIQUE,
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  metodo_pago metodo_pago NOT NULL DEFAULT 'otro',
  notas TEXT,
  usuario_id UUID REFERENCES auth.users(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_adelantos_periodo_socio ON adelantos_socios (periodo_id, socio_id);

CREATE TABLE liquidaciones_socios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id UUID NOT NULL REFERENCES periodos(id) ON DELETE RESTRICT,
  socio_id UUID NOT NULL REFERENCES socios(id) ON DELETE RESTRICT,
  ingresos_cobrados NUMERIC(12,2) NOT NULL,
  donaciones_periodo NUMERIC(12,2) NOT NULL DEFAULT 0,
  ingresos_operativos NUMERIC(12,2) NOT NULL DEFAULT 0,
  egresos_periodo NUMERIC(12,2) NOT NULL,
  utilidad_neta NUMERIC(12,2) NOT NULL,
  porcentaje_aplicado NUMERIC(5,2) NOT NULL,
  valor_correspondiente NUMERIC(12,2) NOT NULL,
  adelantos_descontados NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_neto_pagar NUMERIC(12,2) NOT NULL,
  generado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (periodo_id, socio_id)
);

CREATE TABLE liquidaciones_resumen_cuentas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id UUID NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
  metodo_pago metodo_pago NOT NULL,
  total_ingresos NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_salidas NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_neto_periodo NUMERIC(12,2) NOT NULL DEFAULT 0,
  ingresos_abonos NUMERIC(12,2) NOT NULL DEFAULT 0,
  ingresos_donaciones NUMERIC(12,2) NOT NULL DEFAULT 0,
  ingresos_ventas_externas NUMERIC(12,2) NOT NULL DEFAULT 0,
  salidas_egresos NUMERIC(12,2) NOT NULL DEFAULT 0,
  salidas_adelantos NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (periodo_id, metodo_pago)
);

-- HISTORIAL ASISTENTE IA
CREATE TABLE asistente_ia_conversaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_asistente_ia_conversaciones_usuario_actualizado
  ON asistente_ia_conversaciones (usuario_id, actualizado_en DESC);

CREATE TABLE asistente_ia_mensajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id UUID NOT NULL REFERENCES asistente_ia_conversaciones(id) ON DELETE CASCADE,
  rol TEXT NOT NULL CHECK (rol IN ('user', 'assistant')),
  contenido TEXT NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_asistente_ia_mensajes_conversacion_creado
  ON asistente_ia_mensajes (conversacion_id, creado_en ASC);

ALTER TABLE asistente_ia_conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistente_ia_mensajes ENABLE ROW LEVEL SECURITY;

CREATE POLICY asistente_ia_conversaciones_select_own
  ON asistente_ia_conversaciones
  FOR SELECT
  USING (
    usuario_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM perfiles
      WHERE perfiles.id = auth.uid()
        AND perfiles.rol IN ('admin', 'caja')
    )
  );

CREATE POLICY asistente_ia_conversaciones_insert_own
  ON asistente_ia_conversaciones
  FOR INSERT
  WITH CHECK (
    usuario_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM perfiles
      WHERE perfiles.id = auth.uid()
        AND perfiles.rol IN ('admin', 'caja')
    )
  );

CREATE POLICY asistente_ia_conversaciones_update_own
  ON asistente_ia_conversaciones
  FOR UPDATE
  USING (
    usuario_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM perfiles
      WHERE perfiles.id = auth.uid()
        AND perfiles.rol IN ('admin', 'caja')
    )
  )
  WITH CHECK (
    usuario_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM perfiles
      WHERE perfiles.id = auth.uid()
        AND perfiles.rol IN ('admin', 'caja')
    )
  );

CREATE POLICY asistente_ia_conversaciones_delete_own
  ON asistente_ia_conversaciones
  FOR DELETE
  USING (
    usuario_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM perfiles
      WHERE perfiles.id = auth.uid()
        AND perfiles.rol IN ('admin', 'caja')
    )
  );

CREATE POLICY asistente_ia_mensajes_select_own
  ON asistente_ia_mensajes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM asistente_ia_conversaciones c
      JOIN perfiles p ON p.id = auth.uid()
      WHERE c.id = asistente_ia_mensajes.conversacion_id
        AND c.usuario_id = auth.uid()
        AND p.rol IN ('admin', 'caja')
    )
  );

CREATE POLICY asistente_ia_mensajes_insert_own
  ON asistente_ia_mensajes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM asistente_ia_conversaciones c
      JOIN perfiles p ON p.id = auth.uid()
      WHERE c.id = asistente_ia_mensajes.conversacion_id
        AND c.usuario_id = auth.uid()
        AND p.rol IN ('admin', 'caja')
    )
  );

CREATE POLICY asistente_ia_mensajes_delete_own
  ON asistente_ia_mensajes
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM asistente_ia_conversaciones c
      JOIN perfiles p ON p.id = auth.uid()
      WHERE c.id = asistente_ia_mensajes.conversacion_id
        AND c.usuario_id = auth.uid()
        AND p.rol IN ('admin', 'caja')
    )
  );

-- AUDITORIA
CREATE TABLE auditoria_financiera (
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

CREATE INDEX idx_auditoria_tabla_registro ON auditoria_financiera (tabla_afectada, registro_id, creado_en DESC);

-- CONFIGURACION DE EMPRESA
CREATE TABLE configuracion_empresa (
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

-- VISTA DE SALDOS POR CUENTA
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

-- TRIGGER DE ESTADO DE CUENTA
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

-- HISTORIAL GENERAL
CREATE OR REPLACE VIEW vw_movimientos_generales AS
SELECT
  c.id AS movimiento_id,
  c.fecha_emision AS fecha,
  'cuenta_cobrar' AS tipo_movimiento,
  c.asistente_id,
  a.nombre AS asistente_nombre,
  c.concepto,
  NULL::TEXT AS metodo_pago,
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
  p.id AS movimiento_id,
  p.fecha_pago AS fecha,
  'abono' AS tipo_movimiento,
  c.asistente_id,
  a.nombre AS asistente_nombre,
  c.concepto,
  p.metodo_pago::TEXT AS metodo_pago,
  0::NUMERIC(12,2) AS valor_deuda,
  CASE
    WHEN COALESCE(p.estado, 'activo') <> 'anulado'
      AND (p.notas IS NULL OR p.notas NOT ILIKE '%[ANULADO]%')
      AND COALESCE(LOWER(p.origen_fondos), '') <> 'saldo_a_favor'
      AND COALESCE(LOWER(p.metodo_pago::TEXT), '') <> 'saldo_a_favor'
    THEN p.monto
    ELSE 0
  END AS valor_ingreso,
  0::NUMERIC(12,2) AS valor_egreso,
  p.estado AS estado_o_saldo,
  p.notas,
  p.creado_en,
  NULL::TEXT AS categoria
FROM pagos_abonos p
LEFT JOIN cuentas_por_cobrar c ON c.id = p.cuenta_id
LEFT JOIN asistentes a ON a.id = c.asistente_id

UNION ALL

SELECT
  msf.id AS movimiento_id,
  msf.fecha AS fecha,
  CASE WHEN msf.tipo = 'ingreso' THEN 'anticipo' ELSE 'aplicacion_saldo' END AS tipo_movimiento,
  msf.asistente_id,
  a.nombre AS asistente_nombre,
  COALESCE(msf.notas, 'Saldo a favor') AS concepto,
  msf.metodo_pago::TEXT AS metodo_pago,
  0::NUMERIC(12,2) AS valor_deuda,
  CASE WHEN msf.tipo = 'ingreso' THEN msf.monto ELSE 0 END AS valor_ingreso,
  CASE WHEN msf.tipo = 'aplicacion' THEN msf.monto ELSE 0 END AS valor_egreso,
  msf.tipo AS estado_o_saldo,
  msf.notas,
  msf.creado_en,
  NULL::TEXT AS categoria
FROM movimientos_saldo_favor msf
LEFT JOIN asistentes a ON a.id = msf.asistente_id

UNION ALL

SELECT
  e.id AS movimiento_id,
  e.fecha,
  'egreso' AS tipo_movimiento,
  NULL::UUID AS asistente_id,
  NULL::TEXT AS asistente_nombre,
  e.concepto,
  e.metodo_pago::TEXT AS metodo_pago,
  0::NUMERIC(12,2) AS valor_deuda,
  0::NUMERIC(12,2) AS valor_ingreso,
  CASE
    WHEN COALESCE(e.estado, 'activo') <> 'anulado'
      AND (e.notas IS NULL OR e.notas NOT ILIKE '%[ANULADO]%')
    THEN e.monto
    ELSE 0
  END AS valor_egreso,
  e.estado AS estado_o_saldo,
  e.notas,
  e.creado_en,
  e.categoria
FROM egresos e

UNION ALL

SELECT
  d.id AS movimiento_id,
  d.fecha,
  'donacion' AS tipo_movimiento,
  d.asistente_id,
  a.nombre AS asistente_nombre,
  'Donacion' AS concepto,
  d.metodo_pago::TEXT AS metodo_pago,
  0::NUMERIC(12,2) AS valor_deuda,
  CASE
    WHEN COALESCE(d.estado, 'activo') <> 'anulado'
      AND (d.notas IS NULL OR d.notas NOT ILIKE '%[ANULADO]%')
    THEN d.monto
    ELSE 0
  END AS valor_ingreso,
  0::NUMERIC(12,2) AS valor_egreso,
  d.estado AS estado_o_saldo,
  d.notas,
  d.creado_en,
  NULL::TEXT AS categoria
FROM donaciones_asistentes d
LEFT JOIN asistentes a ON a.id = d.asistente_id

UNION ALL

SELECT
  v.id AS movimiento_id,
  v.fecha,
  'venta_externa' AS tipo_movimiento,
  NULL::UUID AS asistente_id,
  NULL::TEXT AS asistente_nombre,
  v.concepto,
  v.metodo_pago::TEXT AS metodo_pago,
  0::NUMERIC(12,2) AS valor_deuda,
  CASE
    WHEN COALESCE(v.estado, 'activo') <> 'anulado'
      AND (v.notas IS NULL OR v.notas NOT ILIKE '%[ANULADO]%')
    THEN v.monto
    ELSE 0
  END AS valor_ingreso,
  0::NUMERIC(12,2) AS valor_egreso,
  v.estado AS estado_o_saldo,
  v.notas,
  v.creado_en,
  NULL::TEXT AS categoria
FROM ventas_externas v;

-- RPC PARA APLICAR SALDO A FAVOR SIN DESCUADRES
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
  v_cuenta_asistente_id UUID;
  v_valor_total NUMERIC;
  v_total_abonado NUMERIC;
  v_pendiente NUMERIC;
  v_pendiente_usable NUMERIC;
  v_saldo_disponible NUMERIC;
  v_saldo_usable NUMERIC;
  v_pago_id UUID;
  v_movimiento_id UUID;
  v_usuario_id UUID := auth.uid();
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0.';
  END IF;

  IF p_monto <> FLOOR(p_monto) OR MOD(p_monto, 50) <> 0 THEN
    RAISE EXCEPTION 'El monto debe estar en pesos enteros y multiplos de 50.';
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

  SELECT asistente_id, valor_total
  INTO v_cuenta_asistente_id, v_valor_total
  FROM cuentas_por_cobrar
  WHERE id = p_cuenta_id
  FOR UPDATE;

  IF v_valor_total IS NULL THEN
    RAISE EXCEPTION 'Cuenta no encontrada.';
  END IF;

  IF v_cuenta_asistente_id IS DISTINCT FROM p_asistente_id THEN
    RAISE EXCEPTION 'La cuenta no pertenece al asistente indicado.';
  END IF;

  SELECT COALESCE(SUM(monto), 0)
  INTO v_total_abonado
  FROM pagos_abonos
  WHERE cuenta_id = p_cuenta_id
    AND COALESCE(estado, 'activo') <> 'anulado'
    AND (notas IS NULL OR notas NOT ILIKE '%[ANULADO]%');

  v_pendiente := GREATEST(v_valor_total - v_total_abonado, 0);
  v_pendiente_usable := FLOOR(
    GREATEST(
      CASE
        WHEN ABS(ROUND(v_pendiente) - v_pendiente) <= 0.05 THEN ROUND(v_pendiente)
        ELSE FLOOR(v_pendiente)
      END,
      0
    ) / 50
  ) * 50;

  IF p_monto > v_pendiente_usable THEN
    RAISE EXCEPTION 'El monto excede el saldo pendiente de la cuenta.';
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN tipo = 'ingreso' THEN monto
      WHEN tipo = 'aplicacion' THEN -monto
      ELSE 0
    END
  ), 0)
  INTO v_saldo_disponible
  FROM movimientos_saldo_favor
  WHERE asistente_id = p_asistente_id;

  v_saldo_usable := FLOOR(
    GREATEST(
      CASE
        WHEN ABS(ROUND(v_saldo_disponible) - v_saldo_disponible) <= 0.05 THEN ROUND(v_saldo_disponible)
        ELSE FLOOR(v_saldo_disponible)
      END,
      0
    ) / 50
  ) * 50;

  IF p_monto > v_saldo_usable THEN
    RAISE EXCEPTION 'El monto excede el saldo a favor disponible del asistente.';
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

-- RPC DE CIERRE DE LIQUIDACION
CREATE OR REPLACE FUNCTION fn_cerrar_liquidacion(p_periodo_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_inicio DATE;
  v_fin DATE;
  v_estado TEXT;
  v_ingresos_operativos NUMERIC;
  v_egresos_periodo NUMERIC;
  v_utilidad_neta NUMERIC;
  v_donaciones_total NUMERIC;
  v_ventas_externas_total NUMERIC;
BEGIN
  SELECT fecha_inicio, fecha_fin, estado::TEXT
  INTO v_inicio, v_fin, v_estado
  FROM periodos
  WHERE id = p_periodo_id
  FOR UPDATE;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Periodo no encontrado';
  END IF;

  IF v_estado <> 'abierto' THEN
    RETURN;
  END IF;

  WITH metodos AS (
    SELECT unnest(ARRAY['efectivo','nequi','daviplata','otro']::TEXT[]) AS metodo_pago
  ),
  abonos_agg AS (
    SELECT LOWER(COALESCE(pa.metodo_pago::TEXT, 'otro')) AS metodo_pago,
           SUM(pa.monto) AS monto
    FROM pagos_abonos pa
    WHERE pa.fecha_pago BETWEEN v_inicio AND v_fin
      AND COALESCE(pa.estado, 'activo') <> 'anulado'
      AND (pa.notas IS NULL OR pa.notas NOT ILIKE '%[ANULADO]%')
      AND COALESCE(LOWER(pa.origen_fondos), '') <> 'saldo_a_favor'
      AND COALESCE(LOWER(pa.metodo_pago::TEXT), '') <> 'saldo_a_favor'
    GROUP BY 1
  ),
  saldo_favor_ingresos_agg AS (
    SELECT LOWER(COALESCE(msf.metodo_pago::TEXT, 'otro')) AS metodo_pago,
           SUM(msf.monto) AS monto
    FROM movimientos_saldo_favor msf
    WHERE msf.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(LOWER(msf.tipo), '') = 'ingreso'
      AND (msf.notas IS NULL OR msf.notas NOT ILIKE '%[ANULADO]%')
      AND (
        msf.notas IS NULL OR (
          msf.notas NOT ILIKE '%Ajuste de aplicación de saldo a favor%'
          AND msf.notas NOT ILIKE '%Ajuste de aplicacion de saldo a favor%'
          AND msf.notas NOT ILIKE '%Ajuste de saldo a favor por edición del abono%'
          AND msf.notas NOT ILIKE '%Ajuste de saldo a favor por edicion del abono%'
          AND msf.notas NOT ILIKE '%Reversion automatica por anulacion del anticipo%'
          AND msf.notas NOT ILIKE '%Reversion automatica por eliminacion del anticipo%'
        )
      )
    GROUP BY 1
  ),
  donaciones_agg AS (
    SELECT LOWER(COALESCE(d.metodo_pago::TEXT, 'otro')) AS metodo_pago,
           SUM(d.monto) AS monto
    FROM donaciones_asistentes d
    WHERE d.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(d.estado, 'activo') <> 'anulado'
      AND (d.notas IS NULL OR d.notas NOT ILIKE '%[ANULADO]%')
    GROUP BY 1
  ),
  ventas_externas_agg AS (
    SELECT LOWER(COALESCE(v.metodo_pago::TEXT, 'otro')) AS metodo_pago,
           SUM(v.monto) AS monto
    FROM ventas_externas v
    WHERE v.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(v.estado, 'activo') <> 'anulado'
      AND (v.notas IS NULL OR v.notas NOT ILIKE '%[ANULADO]%')
    GROUP BY 1
  ),
  egresos_agg AS (
    SELECT LOWER(COALESCE(e.metodo_pago::TEXT, 'otro')) AS metodo_pago,
           SUM(e.monto) AS monto
    FROM egresos e
    WHERE e.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(e.estado, 'activo') <> 'anulado'
      AND (e.notas IS NULL OR e.notas NOT ILIKE '%[ANULADO]%')
    GROUP BY 1
  ),
  adelantos_agg AS (
    SELECT LOWER(COALESCE(a.metodo_pago::TEXT, 'otro')) AS metodo_pago,
           SUM(a.monto) AS monto
    FROM adelantos_socios a
    WHERE a.fecha BETWEEN v_inicio AND v_fin
    GROUP BY 1
  ),
  resumen AS (
    SELECT
      m.metodo_pago::metodo_pago AS metodo_pago,
      COALESCE(ab.monto, 0) + COALESCE(sf.monto, 0) AS ingresos_abonos,
      COALESCE(dn.monto, 0) AS ingresos_donaciones,
      COALESCE(ve.monto, 0) AS ingresos_ventas_externas,
      COALESCE(eg.monto, 0) AS salidas_egresos,
      COALESCE(ad.monto, 0) AS salidas_adelantos
    FROM metodos m
    LEFT JOIN abonos_agg ab ON ab.metodo_pago = m.metodo_pago
    LEFT JOIN saldo_favor_ingresos_agg sf ON sf.metodo_pago = m.metodo_pago
    LEFT JOIN donaciones_agg dn ON dn.metodo_pago = m.metodo_pago
    LEFT JOIN ventas_externas_agg ve ON ve.metodo_pago = m.metodo_pago
    LEFT JOIN egresos_agg eg ON eg.metodo_pago = m.metodo_pago
    LEFT JOIN adelantos_agg ad ON ad.metodo_pago = m.metodo_pago
  )
  INSERT INTO liquidaciones_resumen_cuentas (
    periodo_id,
    metodo_pago,
    total_ingresos,
    total_salidas,
    saldo_neto_periodo,
    ingresos_abonos,
    ingresos_donaciones,
    ingresos_ventas_externas,
    salidas_egresos,
    salidas_adelantos,
    created_at,
    updated_at
  )
  SELECT
    p_periodo_id,
    r.metodo_pago,
    r.ingresos_abonos + r.ingresos_donaciones + r.ingresos_ventas_externas,
    r.salidas_egresos,
    r.ingresos_abonos + r.ingresos_donaciones + r.ingresos_ventas_externas - r.salidas_egresos,
    r.ingresos_abonos,
    r.ingresos_donaciones,
    r.ingresos_ventas_externas,
    r.salidas_egresos,
    r.salidas_adelantos,
    NOW(),
    NOW()
  FROM resumen r
  ON CONFLICT (periodo_id, metodo_pago) DO UPDATE SET
    total_ingresos = EXCLUDED.total_ingresos,
    total_salidas = EXCLUDED.total_salidas,
    saldo_neto_periodo = EXCLUDED.saldo_neto_periodo,
    ingresos_abonos = EXCLUDED.ingresos_abonos,
    ingresos_donaciones = EXCLUDED.ingresos_donaciones,
    ingresos_ventas_externas = EXCLUDED.ingresos_ventas_externas,
    salidas_egresos = EXCLUDED.salidas_egresos,
    salidas_adelantos = EXCLUDED.salidas_adelantos,
    updated_at = NOW();

  SELECT
    SUM(r.ingresos_abonos + r.ingresos_donaciones + r.ingresos_ventas_externas),
    SUM(r.salidas_egresos),
    SUM(r.ingresos_donaciones),
    SUM(r.ingresos_ventas_externas)
  INTO v_ingresos_operativos, v_egresos_periodo, v_donaciones_total, v_ventas_externas_total
  FROM liquidaciones_resumen_cuentas r
  WHERE r.periodo_id = p_periodo_id;

  v_utilidad_neta := COALESCE(v_ingresos_operativos, 0) - COALESCE(v_egresos_periodo, 0);

  INSERT INTO liquidaciones_socios (
    periodo_id,
    socio_id,
    ingresos_cobrados,
    donaciones_periodo,
    ingresos_operativos,
    egresos_periodo,
    utilidad_neta,
    porcentaje_aplicado,
    valor_correspondiente,
    adelantos_descontados,
    valor_neto_pagar
  )
  SELECT
    p_periodo_id,
    s.id,
    COALESCE(v_ingresos_operativos, 0) - COALESCE(v_donaciones_total, 0) - COALESCE(v_ventas_externas_total, 0) AS ingresos_cobrados,
    COALESCE(v_donaciones_total, 0) AS donaciones_periodo,
    COALESCE(v_ingresos_operativos, 0) AS ingresos_operativos,
    COALESCE(v_egresos_periodo, 0) AS egresos_periodo,
    v_utilidad_neta,
    s.porcentaje_participacion,
    ROUND((v_utilidad_neta * s.porcentaje_participacion) / 100, 2),
    (
      SELECT COALESCE(SUM(ad.monto), 0)
      FROM adelantos_socios ad
      WHERE ad.periodo_id = p_periodo_id
        AND ad.socio_id = s.id
    ),
    ROUND(
      ((v_utilidad_neta * s.porcentaje_participacion) / 100) -
      (
        SELECT COALESCE(SUM(ad.monto), 0)
        FROM adelantos_socios ad
        WHERE ad.periodo_id = p_periodo_id
          AND ad.socio_id = s.id
      ),
      2
    )
  FROM socios s
  WHERE s.activo = true
  ON CONFLICT (periodo_id, socio_id) DO UPDATE SET
    ingresos_cobrados = EXCLUDED.ingresos_cobrados,
    donaciones_periodo = EXCLUDED.donaciones_periodo,
    ingresos_operativos = EXCLUDED.ingresos_operativos,
    egresos_periodo = EXCLUDED.egresos_periodo,
    utilidad_neta = EXCLUDED.utilidad_neta,
    porcentaje_aplicado = EXCLUDED.porcentaje_aplicado,
    valor_correspondiente = EXCLUDED.valor_correspondiente,
    adelantos_descontados = EXCLUDED.adelantos_descontados,
    valor_neto_pagar = EXCLUDED.valor_neto_pagar;

  UPDATE periodos
  SET estado = 'cerrado'
  WHERE id = p_periodo_id;
END;
$$;
