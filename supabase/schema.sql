-- supabase/schema.sql

-- ENUMS
CREATE TYPE estado_cuenta AS ENUM ('pendiente', 'parcial', 'pagado');
CREATE TYPE metodo_pago AS ENUM ('efectivo', 'nequi', 'daviplata', 'otro');
CREATE TYPE estado_periodo AS ENUM ('abierto', 'cerrado');
CREATE TYPE rol_usuario AS ENUM ('admin', 'caja', 'consulta');

-- PERFILES (Auth)
CREATE TABLE perfiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  nombre TEXT NOT NULL,
  rol rol_usuario DEFAULT 'consulta' NOT NULL,
  asistente_id UUID UNIQUE REFERENCES asistentes(id),
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ASISTENTES (Mapeo exacto del legacy)
CREATE TABLE asistentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_row_id TEXT UNIQUE, -- Row ID de AppSheet
  legacy_asistente_id TEXT,  -- Asistente Id de AppSheet
  codigo TEXT,
  nombre TEXT NOT NULL,
  cedula TEXT UNIQUE,
  correo TEXT,
  telefono TEXT,
  fecha_registro DATE,
  fecha_inicio_proceso DATE,
  activo BOOLEAN DEFAULT true,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CUENTAS POR COBRAR (El "Valor Compra" del legacy)
CREATE TABLE cuentas_por_cobrar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asistente_id UUID REFERENCES asistentes(id) ON DELETE RESTRICT,
  legacy_row_id TEXT UNIQUE, -- Row ID del movimiento original
  concepto TEXT NOT NULL,
  valor_total DECIMAL(12,2) NOT NULL CHECK (valor_total > 0), -- Ej: 768000
  fecha_emision DATE NOT NULL,
  estado estado_cuenta DEFAULT 'pendiente' NOT NULL,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- PAGOS / ABONOS (El "Valor Abonado" del legacy)
CREATE TABLE pagos_abonos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id UUID REFERENCES cuentas_por_cobrar(id) ON DELETE CASCADE,
  legacy_row_id TEXT UNIQUE, -- Si el abono vino de un registro legacy
  monto DECIMAL(12,2) NOT NULL CHECK (monto > 0), -- Ej: 600000
  metodo_pago metodo_pago NOT NULL,
  fecha_pago DATE NOT NULL,
  notas TEXT,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- EGRESOS
CREATE TABLE egresos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_row_id TEXT UNIQUE,
  concepto TEXT NOT NULL,
  monto DECIMAL(12,2) NOT NULL CHECK (monto > 0),
  categoria TEXT NOT NULL,
  metodo_pago metodo_pago NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  notas TEXT,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SOCIOS
CREATE TABLE socios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES perfiles(id),
  legacy_row_id TEXT UNIQUE,
  nombre TEXT NOT NULL,
  porcentaje_participacion DECIMAL(5,2) NOT NULL CHECK (porcentaje_participacion >= 0 AND porcentaje_participacion <= 100),
  activo BOOLEAN DEFAULT true,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- PERIODOS (Reemplaza USERSETTINGS)
CREATE TABLE periodos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_row_id TEXT UNIQUE,
  nombre TEXT NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  estado estado_periodo DEFAULT 'abierto' NOT NULL,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ADELANTOS SOCIOS
CREATE TABLE adelantos_socios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id UUID REFERENCES socios(id) ON DELETE RESTRICT,
  periodo_id UUID REFERENCES periodos(id) ON DELETE RESTRICT,
  legacy_row_id TEXT UNIQUE,
  monto DECIMAL(12,2) NOT NULL CHECK (monto > 0),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  notas TEXT,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- LIQUIDACIONES
CREATE TABLE liquidaciones_socios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id UUID REFERENCES periodos(id) ON DELETE RESTRICT,
  socio_id UUID REFERENCES socios(id) ON DELETE RESTRICT,
  ingresos_cobrados DECIMAL(12,2) NOT NULL,
  donaciones_periodo DECIMAL(12,2) NOT NULL DEFAULT 0,
  ingresos_operativos DECIMAL(12,2) NOT NULL DEFAULT 0,
  egresos_periodo DECIMAL(12,2) NOT NULL,
  utilidad_neta DECIMAL(12,2) NOT NULL,
  porcentaje_aplicado DECIMAL(5,2) NOT NULL,
  valor_correspondiente DECIMAL(12,2) NOT NULL,
  adelantos_descontados DECIMAL(12,2) NOT NULL,
  valor_neto_pagar DECIMAL(12,2) NOT NULL,
  generado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(periodo_id, socio_id)
);

-- VISTA PARA RESOLVER EL "MONTO PENDIENTE" (Ej: 168000)
CREATE OR REPLACE VIEW vista_cuentas_saldos AS
SELECT 
  c.id,
  c.asistente_id,
  c.valor_total, -- 768000
  COALESCE(SUM(p.monto), 0) as total_abonado, -- 600000
  (c.valor_total - COALESCE(SUM(p.monto), 0)) as monto_pendiente, -- 168000
  c.estado
FROM cuentas_por_cobrar c
LEFT JOIN pagos_abonos p ON c.id = p.cuenta_id
GROUP BY c.id;

-- TRIGGER PARA ACTUALIZAR ESTADO AUTOMÁTICAMENTE
CREATE OR REPLACE FUNCTION actualizar_estado_cuenta() RETURNS TRIGGER AS $$
DECLARE
  v_total DECIMAL;
  v_abonado DECIMAL;
BEGIN
  SELECT valor_total INTO v_total FROM cuentas_por_cobrar WHERE id = COALESCE(NEW.cuenta_id, OLD.cuenta_id);
  SELECT COALESCE(SUM(monto), 0) INTO v_abonado FROM pagos_abonos WHERE cuenta_id = COALESCE(NEW.cuenta_id, OLD.cuenta_id);
  
  IF v_abonado >= v_total THEN
    UPDATE cuentas_por_cobrar SET estado = 'pagado' WHERE id = COALESCE(NEW.cuenta_id, OLD.cuenta_id);
  ELSIF v_abonado > 0 THEN
    UPDATE cuentas_por_cobrar SET estado = 'parcial' WHERE id = COALESCE(NEW.cuenta_id, OLD.cuenta_id);
  ELSE
    UPDATE cuentas_por_cobrar SET estado = 'pendiente' WHERE id = COALESCE(NEW.cuenta_id, OLD.cuenta_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_estado_cuenta AFTER INSERT OR UPDATE OR DELETE ON pagos_abonos
FOR EACH ROW EXECUTE FUNCTION actualizar_estado_cuenta();

-- PAQUETES COACH (una cuenta -> un paquete)
CREATE TABLE IF NOT EXISTS coach_paquetes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id UUID NOT NULL REFERENCES cuentas_por_cobrar(id) ON DELETE CASCADE,
  asistente_id UUID NOT NULL REFERENCES asistentes(id) ON DELETE RESTRICT,
  sesiones_compradas INTEGER NOT NULL CHECK (sesiones_compradas > 0),
  notas TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cuenta_id)
);

CREATE INDEX IF NOT EXISTS coach_paquetes_asistente_idx ON coach_paquetes (asistente_id);

-- Sesiones registradas de paquetes coach
CREATE TABLE IF NOT EXISTS coach_sesiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paquete_id UUID NOT NULL REFERENCES coach_paquetes(id) ON DELETE CASCADE,
  asistente_id UUID NOT NULL REFERENCES asistentes(id) ON DELETE RESTRICT,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  notas TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coach_sesiones_paquete_idx ON coach_sesiones (paquete_id);
CREATE INDEX IF NOT EXISTS coach_sesiones_asistente_idx ON coach_sesiones (asistente_id);

-- DONACIONES DE ASISTENTES (flujo independiente a cuentas/abonos)
CREATE TABLE IF NOT EXISTS donaciones_asistentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asistente_id UUID NOT NULL REFERENCES asistentes(id) ON DELETE RESTRICT,
  legacy_row_id TEXT UNIQUE,
  monto DECIMAL(12,2) NOT NULL CHECK (monto > 0),
  metodo_pago metodo_pago NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  notas TEXT,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','anulado')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_donaciones_asistente_fecha ON donaciones_asistentes (asistente_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_donaciones_estado ON donaciones_asistentes (estado);

-- Vista de movimientos generales (incluye donaciones)
CREATE OR REPLACE VIEW vw_movimientos_generales AS
SELECT
  c.id AS movimiento_id,
  c.fecha_emision AS fecha,
  'cuenta_cobrar' AS tipo_movimiento,
  c.asistente_id,
  a.nombre AS asistente_nombre,
  c.concepto AS concepto,
  NULL::metodo_pago AS metodo_pago,
  GREATEST(c.valor_total - COALESCE((
    SELECT SUM(pa.monto) FROM pagos_abonos pa WHERE pa.cuenta_id = c.id AND pa.estado <> 'anulado' AND pa.notas NOT ILIKE '%[ANULADO]%'
  ), 0),0) AS valor_deuda,
  0::DECIMAL(12,2) AS valor_ingreso,
  0::DECIMAL(12,2) AS valor_egreso,
  c.estado AS estado_o_saldo,
  NULL::text AS notas,
  c.creado_en AS creado_en,
  NULL::text AS categoria
FROM cuentas_por_cobrar c
LEFT JOIN asistentes a ON a.id = c.asistente_id

UNION ALL

SELECT
  p.id AS movimiento_id,
  p.fecha_pago AS fecha,
  'abono' AS tipo_movimiento,
  c.asistente_id,
  a.nombre AS asistente_nombre,
  c.concepto AS concepto,
  p.metodo_pago AS metodo_pago,
  0::DECIMAL(12,2) AS valor_deuda,
  CASE WHEN p.estado <> 'anulado' AND p.notas NOT ILIKE '%[ANULADO]%' THEN p.monto ELSE 0 END AS valor_ingreso,
  0::DECIMAL(12,2) AS valor_egreso,
  p.estado AS estado_o_saldo,
  p.notas AS notas,
  p.creado_en AS creado_en,
  NULL::text AS categoria
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
  msf.metodo_pago AS metodo_pago,
  0::DECIMAL(12,2) AS valor_deuda,
  CASE WHEN msf.tipo = 'ingreso' THEN msf.monto ELSE 0 END AS valor_ingreso,
  CASE WHEN msf.tipo = 'aplicacion' THEN msf.monto ELSE 0 END AS valor_egreso,
  msf.tipo AS estado_o_saldo,
  msf.notas AS notas,
  msf.creado_en AS creado_en,
  NULL::text AS categoria
FROM movimientos_saldo_favor msf
LEFT JOIN asistentes a ON a.id = msf.asistente_id

UNION ALL

SELECT
  e.id AS movimiento_id,
  e.fecha AS fecha,
  'egreso' AS tipo_movimiento,
  NULL::uuid AS asistente_id,
  NULL::text AS asistente_nombre,
  e.concepto AS concepto,
  e.metodo_pago AS metodo_pago,
  0::DECIMAL(12,2) AS valor_deuda,
  0::DECIMAL(12,2) AS valor_ingreso,
  CASE WHEN e.estado <> 'anulado' AND e.notas NOT ILIKE '%[ANULADO]%' THEN e.monto ELSE 0 END AS valor_egreso,
  e.estado AS estado_o_saldo,
  e.notas AS notas,
  e.creado_en AS creado_en,
  e.categoria AS categoria
FROM egresos e

UNION ALL

SELECT
  d.id AS movimiento_id,
  d.fecha AS fecha,
  'donacion' AS tipo_movimiento,
  d.asistente_id AS asistente_id,
  a.nombre AS asistente_nombre,
  'Donación' AS concepto,
  d.metodo_pago AS metodo_pago,
  0::DECIMAL(12,2) AS valor_deuda,
  CASE WHEN d.estado <> 'anulado' THEN d.monto ELSE 0 END AS valor_ingreso,
  0::DECIMAL(12,2) AS valor_egreso,
  d.estado AS estado_o_saldo,
  d.notas AS notas,
  d.creado_en AS creado_en,
  NULL::text AS categoria
FROM donaciones_asistentes d
LEFT JOIN asistentes a ON a.id = d.asistente_id;

-- FUNCIÓN TRANSACCIONAL PARA CERRAR LIQUIDACIÓN CON SNAPSHOT POR CUENTA
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
BEGIN
  SELECT fecha_inicio, fecha_fin, estado INTO v_inicio, v_fin, v_estado
  FROM periodos WHERE id = p_periodo_id FOR UPDATE;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Periodo no encontrado';
  END IF;

  IF v_estado <> 'abierto' THEN
    RETURN;
  END IF;

  WITH abonos_vista AS (
    SELECT LOWER(COALESCE(metodo_pago::text, 'otro')) AS metodo_pago, valor_ingreso AS monto
    FROM vw_movimientos_generales
    WHERE tipo_movimiento = 'abono'
      AND fecha BETWEEN v_inicio AND v_fin
  ),
  donaciones_vista AS (
    SELECT LOWER(COALESCE(metodo_pago::text, 'otro')) AS metodo_pago, valor_ingreso AS monto
    FROM vw_movimientos_generales
    WHERE tipo_movimiento = 'donacion'
      AND fecha BETWEEN v_inicio AND v_fin
  ),
  egresos_validos AS (
    SELECT LOWER(COALESCE(metodo_pago::text, 'otro')) AS metodo_pago, monto
    FROM egresos
    WHERE fecha BETWEEN v_inicio AND v_fin
      AND estado <> 'anulado'
      AND notas NOT ILIKE '%[ANULADO]%'
  ),
  adelantos_validos AS (
    SELECT LOWER(COALESCE(metodo_pago::text, 'otro')) AS metodo_pago, monto
    FROM adelantos_socios
    WHERE fecha BETWEEN v_inicio AND v_fin
  ),
  metodos AS (
    SELECT unnest(ARRAY['efectivo','nequi','daviplata','otro']) AS metodo_pago
  ),
  resumen AS (
    SELECT
      m.metodo_pago::metodo_pago AS metodo_pago,
      COALESCE(SUM(ab.monto),0) AS ingresos_abonos,
      COALESCE(SUM(d.monto),0) AS ingresos_donaciones,
      COALESCE(SUM(e.monto),0) AS salidas_egresos,
      COALESCE(SUM(ad.monto),0) AS salidas_adelantos
    FROM metodos m
    LEFT JOIN abonos_vista ab ON ab.metodo_pago = m.metodo_pago
    LEFT JOIN donaciones_vista d ON d.metodo_pago = m.metodo_pago
    LEFT JOIN egresos_validos e ON e.metodo_pago = m.metodo_pago
    LEFT JOIN adelantos_validos ad ON ad.metodo_pago = m.metodo_pago
    GROUP BY m.metodo_pago
  )
  INSERT INTO liquidaciones_resumen_cuentas (
    periodo_id, metodo_pago, total_ingresos, total_salidas, saldo_neto_periodo,
    ingresos_abonos, ingresos_donaciones, salidas_egresos, salidas_adelantos,
    created_at, updated_at
  )
  SELECT
    p_periodo_id,
    r.metodo_pago,
    (r.ingresos_abonos + r.ingresos_donaciones) AS total_ingresos,
    (r.salidas_egresos + r.salidas_adelantos) AS total_salidas,
    (r.ingresos_abonos + r.ingresos_donaciones - r.salidas_egresos - r.salidas_adelantos) AS saldo_neto_periodo,
    r.ingresos_abonos,
    r.ingresos_donaciones,
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
    salidas_egresos = EXCLUDED.salidas_egresos,
    salidas_adelantos = EXCLUDED.salidas_adelantos,
    updated_at = NOW();

  SELECT
    SUM(r.ingresos_abonos + r.ingresos_donaciones),
    SUM(r.salidas_egresos + r.salidas_adelantos),
    SUM(r.ingresos_donaciones)
  INTO v_ingresos_operativos, v_egresos_periodo, v_donaciones_total
  FROM liquidaciones_resumen_cuentas r
  WHERE periodo_id = p_periodo_id;

  v_utilidad_neta := COALESCE(v_ingresos_operativos,0) - COALESCE(v_egresos_periodo,0);

  INSERT INTO liquidaciones_socios (
    periodo_id, socio_id, ingresos_cobrados, donaciones_periodo, ingresos_operativos,
    egresos_periodo, utilidad_neta, porcentaje_aplicado, valor_correspondiente,
    adelantos_descontados, valor_neto_pagar
  )
  SELECT
    p_periodo_id,
    s.id,
    COALESCE(v_ingresos_operativos,0) - COALESCE(v_donaciones_total,0) AS ingresos_cobrados,
    COALESCE(v_donaciones_total,0) AS donaciones_periodo,
    COALESCE(v_ingresos_operativos,0) AS ingresos_operativos,
    COALESCE(v_egresos_periodo,0) AS egresos_periodo,
    v_utilidad_neta AS utilidad_neta,
    porcentaje_participacion AS porcentaje_aplicado,
    ROUND((v_utilidad_neta * porcentaje_participacion) / 100)::DECIMAL(12,2) AS valor_correspondiente,
    (
      SELECT COALESCE(SUM(monto),0) FROM adelantos_socios
      WHERE periodo_id = p_periodo_id AND socio_id = s.id
    ) AS adelantos_descontados,
    ROUND(((v_utilidad_neta * porcentaje_participacion) / 100) -
      (
        SELECT COALESCE(SUM(monto),0) FROM adelantos_socios
        WHERE periodo_id = p_periodo_id AND socio_id = s.id
      ), 2) AS valor_neto_pagar
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

  UPDATE periodos SET estado = 'cerrado' WHERE id = p_periodo_id;
END;
$$;
