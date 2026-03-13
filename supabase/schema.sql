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
