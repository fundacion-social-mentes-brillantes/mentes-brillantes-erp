-- Security hardening for a public repository / protected data model.
-- This migration is intentionally conservative:
-- - It does not drop tables, columns, data, or previous migrations.
-- - It does not change financial formulas or business calculations.
-- - It adds RLS, role-aware policies, safer view behavior, and RPC role checks.

-- ---------------------------------------------------------------------------
-- Role helpers used by RLS policies.
-- SECURITY DEFINER avoids recursive policies on perfiles while checking roles.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mb_current_role()
RETURNS public.rol_usuario
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT p.rol
  FROM public.perfiles p
  WHERE p.id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.mb_current_asistente_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT p.asistente_id
  FROM public.perfiles p
  WHERE p.id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.mb_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.mb_current_role() = 'admin'::public.rol_usuario
$$;

CREATE OR REPLACE FUNCTION public.mb_is_admin_or_caja()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.mb_current_role() IN ('admin'::public.rol_usuario, 'caja'::public.rol_usuario)
$$;

CREATE OR REPLACE FUNCTION public.mb_is_consulta_owner(p_asistente_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.mb_current_role() = 'consulta'::public.rol_usuario
    AND public.mb_current_asistente_id() IS NOT NULL
    AND public.mb_current_asistente_id() = p_asistente_id
$$;

REVOKE ALL ON FUNCTION public.mb_current_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mb_current_asistente_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mb_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mb_is_admin_or_caja() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mb_is_consulta_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mb_current_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mb_current_asistente_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mb_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mb_is_admin_or_caja() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mb_is_consulta_owner(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS on sensitive tables.
-- ---------------------------------------------------------------------------
ALTER TABLE public.asistentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuentas_por_cobrar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_abonos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_saldo_favor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.egresos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donaciones_asistentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas_externas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_paquetes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.socios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adelantos_socios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liquidaciones_socios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liquidaciones_resumen_cuentas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_financiera ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion_empresa ENABLE ROW LEVEL SECURITY;

-- Prevent direct anonymous table access. Authenticated access is still governed
-- by the policies below. Supabase service role retains its normal bypass.
REVOKE ALL ON public.asistentes FROM anon;
REVOKE ALL ON public.perfiles FROM anon;
REVOKE ALL ON public.cuentas_por_cobrar FROM anon;
REVOKE ALL ON public.pagos_abonos FROM anon;
REVOKE ALL ON public.movimientos_saldo_favor FROM anon;
REVOKE ALL ON public.egresos FROM anon;
REVOKE ALL ON public.donaciones_asistentes FROM anon;
REVOKE ALL ON public.ventas_externas FROM anon;
REVOKE ALL ON public.coach_paquetes FROM anon;
REVOKE ALL ON public.coach_sesiones FROM anon;
REVOKE ALL ON public.socios FROM anon;
REVOKE ALL ON public.periodos FROM anon;
REVOKE ALL ON public.adelantos_socios FROM anon;
REVOKE ALL ON public.liquidaciones_socios FROM anon;
REVOKE ALL ON public.liquidaciones_resumen_cuentas FROM anon;
REVOKE ALL ON public.auditoria_financiera FROM anon;
REVOKE ALL ON public.configuracion_empresa FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asistentes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.perfiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cuentas_por_cobrar TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagos_abonos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimientos_saldo_favor TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.egresos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.donaciones_asistentes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ventas_externas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_paquetes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_sesiones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.socios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.periodos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adelantos_socios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.liquidaciones_socios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.liquidaciones_resumen_cuentas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auditoria_financiera TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.configuracion_empresa TO authenticated;

-- ---------------------------------------------------------------------------
-- Replace existing or broad policies with role-aware policies.
-- ---------------------------------------------------------------------------
-- Clean up older policy names that were already present in production so the
-- final access rules are not weakened by a leftover permissive policy.
DROP POLICY IF EXISTS asistentes_select_admin_caja ON public.asistentes;
DROP POLICY IF EXISTS cuentas_select_admin_caja ON public.cuentas_por_cobrar;
DROP POLICY IF EXISTS cuentas_delete_admin ON public.cuentas_por_cobrar;
DROP POLICY IF EXISTS pagos_select_admin_caja ON public.pagos_abonos;
DROP POLICY IF EXISTS pagos_delete_admin ON public.pagos_abonos;
DROP POLICY IF EXISTS saldo_favor_select_admin_caja ON public.movimientos_saldo_favor;
DROP POLICY IF EXISTS saldo_favor_insert_admin_caja ON public.movimientos_saldo_favor;
DROP POLICY IF EXISTS saldo_favor_update_admin ON public.movimientos_saldo_favor;
DROP POLICY IF EXISTS saldo_favor_delete_admin ON public.movimientos_saldo_favor;
DROP POLICY IF EXISTS egresos_insert_admin_caja ON public.egresos;
DROP POLICY IF EXISTS donaciones_select_admin_caja ON public.donaciones_asistentes;
DROP POLICY IF EXISTS ventas_externas_select ON public.ventas_externas;
DROP POLICY IF EXISTS ventas_externas_insert ON public.ventas_externas;
DROP POLICY IF EXISTS ventas_externas_update ON public.ventas_externas;
DROP POLICY IF EXISTS ventas_externas_delete ON public.ventas_externas;
DROP POLICY IF EXISTS coach_paquetes_select_admin_caja ON public.coach_paquetes;
DROP POLICY IF EXISTS coach_sesiones_select_admin_caja ON public.coach_sesiones;
DROP POLICY IF EXISTS socios_admin_all ON public.socios;
DROP POLICY IF EXISTS periodos_admin_all ON public.periodos;
DROP POLICY IF EXISTS adelantos_socios_admin_all ON public.adelantos_socios;
DROP POLICY IF EXISTS liquidaciones_socios_admin_all ON public.liquidaciones_socios;
DROP POLICY IF EXISTS liquidaciones_resumen_cuentas_admin_all ON public.liquidaciones_resumen_cuentas;
DROP POLICY IF EXISTS "Todos pueden ver la configuracion" ON public.configuracion_empresa;
DROP POLICY IF EXISTS "Solo admins pueden actualizar la configuracion" ON public.configuracion_empresa;

DROP POLICY IF EXISTS perfiles_select_secure ON public.perfiles;
DROP POLICY IF EXISTS perfiles_insert_admin ON public.perfiles;
DROP POLICY IF EXISTS perfiles_update_admin ON public.perfiles;
DROP POLICY IF EXISTS perfiles_delete_admin ON public.perfiles;
CREATE POLICY perfiles_select_secure ON public.perfiles
  FOR SELECT USING (public.mb_is_admin() OR id = auth.uid());
CREATE POLICY perfiles_insert_admin ON public.perfiles
  FOR INSERT WITH CHECK (public.mb_is_admin());
CREATE POLICY perfiles_update_admin ON public.perfiles
  FOR UPDATE USING (public.mb_is_admin()) WITH CHECK (public.mb_is_admin());
CREATE POLICY perfiles_delete_admin ON public.perfiles
  FOR DELETE USING (public.mb_is_admin());

DROP POLICY IF EXISTS asistentes_select_roles ON public.asistentes;
DROP POLICY IF EXISTS asistentes_insert_admin_caja ON public.asistentes;
DROP POLICY IF EXISTS asistentes_update_admin_caja ON public.asistentes;
DROP POLICY IF EXISTS asistentes_delete_admin ON public.asistentes;
CREATE POLICY asistentes_select_roles ON public.asistentes
  FOR SELECT USING (public.mb_is_admin_or_caja() OR public.mb_is_consulta_owner(id));
CREATE POLICY asistentes_insert_admin_caja ON public.asistentes
  FOR INSERT WITH CHECK (public.mb_is_admin_or_caja());
CREATE POLICY asistentes_update_admin_caja ON public.asistentes
  FOR UPDATE USING (public.mb_is_admin_or_caja()) WITH CHECK (public.mb_is_admin_or_caja());
CREATE POLICY asistentes_delete_admin ON public.asistentes
  FOR DELETE USING (public.mb_is_admin());

DROP POLICY IF EXISTS cuentas_select_roles ON public.cuentas_por_cobrar;
DROP POLICY IF EXISTS cuentas_insert_admin_caja ON public.cuentas_por_cobrar;
DROP POLICY IF EXISTS cuentas_update_admin_caja ON public.cuentas_por_cobrar;
DROP POLICY IF EXISTS cuentas_delete_admin_recent_caja ON public.cuentas_por_cobrar;
CREATE POLICY cuentas_select_roles ON public.cuentas_por_cobrar
  FOR SELECT USING (public.mb_is_admin_or_caja() OR public.mb_is_consulta_owner(asistente_id));
CREATE POLICY cuentas_insert_admin_caja ON public.cuentas_por_cobrar
  FOR INSERT WITH CHECK (public.mb_is_admin_or_caja());
CREATE POLICY cuentas_update_admin_caja ON public.cuentas_por_cobrar
  FOR UPDATE USING (public.mb_is_admin_or_caja()) WITH CHECK (public.mb_is_admin_or_caja());
CREATE POLICY cuentas_delete_admin_recent_caja ON public.cuentas_por_cobrar
  FOR DELETE USING (
    public.mb_is_admin()
    OR (
      public.mb_current_role() = 'caja'::public.rol_usuario
      AND estado = 'pendiente'::public.estado_cuenta
      AND creado_en > now() - interval '15 minutes'
    )
  );

DROP POLICY IF EXISTS pagos_select_roles ON public.pagos_abonos;
DROP POLICY IF EXISTS pagos_insert_admin_caja ON public.pagos_abonos;
DROP POLICY IF EXISTS pagos_update_admin ON public.pagos_abonos;
DROP POLICY IF EXISTS pagos_delete_admin_recent_caja ON public.pagos_abonos;
CREATE POLICY pagos_select_roles ON public.pagos_abonos
  FOR SELECT USING (
    public.mb_is_admin_or_caja()
    OR EXISTS (
      SELECT 1
      FROM public.cuentas_por_cobrar c
      WHERE c.id = pagos_abonos.cuenta_id
        AND public.mb_is_consulta_owner(c.asistente_id)
    )
  );
CREATE POLICY pagos_insert_admin_caja ON public.pagos_abonos
  FOR INSERT WITH CHECK (public.mb_is_admin_or_caja());
CREATE POLICY pagos_update_admin ON public.pagos_abonos
  FOR UPDATE USING (public.mb_is_admin()) WITH CHECK (public.mb_is_admin());
CREATE POLICY pagos_delete_admin_recent_caja ON public.pagos_abonos
  FOR DELETE USING (
    public.mb_is_admin()
    OR (
      public.mb_current_role() = 'caja'::public.rol_usuario
      AND usuario_id = auth.uid()
      AND creado_en > now() - interval '15 minutes'
    )
  );

DROP POLICY IF EXISTS saldo_select_roles ON public.movimientos_saldo_favor;
DROP POLICY IF EXISTS saldo_insert_admin_caja ON public.movimientos_saldo_favor;
DROP POLICY IF EXISTS saldo_update_admin ON public.movimientos_saldo_favor;
DROP POLICY IF EXISTS saldo_delete_admin_recent_caja ON public.movimientos_saldo_favor;
CREATE POLICY saldo_select_roles ON public.movimientos_saldo_favor
  FOR SELECT USING (public.mb_is_admin_or_caja() OR public.mb_is_consulta_owner(asistente_id));
CREATE POLICY saldo_insert_admin_caja ON public.movimientos_saldo_favor
  FOR INSERT WITH CHECK (public.mb_is_admin_or_caja());
CREATE POLICY saldo_update_admin ON public.movimientos_saldo_favor
  FOR UPDATE USING (public.mb_is_admin()) WITH CHECK (public.mb_is_admin());
CREATE POLICY saldo_delete_admin_recent_caja ON public.movimientos_saldo_favor
  FOR DELETE USING (
    public.mb_is_admin()
    OR (
      public.mb_current_role() = 'caja'::public.rol_usuario
      AND usuario_id = auth.uid()
      AND creado_en > now() - interval '15 minutes'
    )
  );

DROP POLICY IF EXISTS egresos_select_admin_caja ON public.egresos;
DROP POLICY IF EXISTS egresos_insert_admin ON public.egresos;
DROP POLICY IF EXISTS egresos_update_admin ON public.egresos;
DROP POLICY IF EXISTS egresos_delete_admin ON public.egresos;
CREATE POLICY egresos_select_admin_caja ON public.egresos
  FOR SELECT USING (public.mb_is_admin_or_caja());
CREATE POLICY egresos_insert_admin ON public.egresos
  FOR INSERT WITH CHECK (public.mb_is_admin());
CREATE POLICY egresos_update_admin ON public.egresos
  FOR UPDATE USING (public.mb_is_admin()) WITH CHECK (public.mb_is_admin());
CREATE POLICY egresos_delete_admin ON public.egresos
  FOR DELETE USING (public.mb_is_admin());

DROP POLICY IF EXISTS donaciones_select_roles ON public.donaciones_asistentes;
DROP POLICY IF EXISTS donaciones_insert_admin_caja ON public.donaciones_asistentes;
DROP POLICY IF EXISTS donaciones_update_admin ON public.donaciones_asistentes;
DROP POLICY IF EXISTS donaciones_delete_admin ON public.donaciones_asistentes;
CREATE POLICY donaciones_select_roles ON public.donaciones_asistentes
  FOR SELECT USING (public.mb_is_admin_or_caja() OR public.mb_is_consulta_owner(asistente_id));
CREATE POLICY donaciones_insert_admin_caja ON public.donaciones_asistentes
  FOR INSERT WITH CHECK (public.mb_is_admin_or_caja());
CREATE POLICY donaciones_update_admin ON public.donaciones_asistentes
  FOR UPDATE USING (public.mb_is_admin()) WITH CHECK (public.mb_is_admin());
CREATE POLICY donaciones_delete_admin ON public.donaciones_asistentes
  FOR DELETE USING (public.mb_is_admin());

DROP POLICY IF EXISTS ventas_externas_select_roles ON public.ventas_externas;
DROP POLICY IF EXISTS ventas_externas_insert_admin_caja ON public.ventas_externas;
DROP POLICY IF EXISTS ventas_externas_update_admin ON public.ventas_externas;
DROP POLICY IF EXISTS ventas_externas_delete_admin ON public.ventas_externas;
CREATE POLICY ventas_externas_select_roles ON public.ventas_externas
  FOR SELECT USING (public.mb_is_admin_or_caja());
CREATE POLICY ventas_externas_insert_admin_caja ON public.ventas_externas
  FOR INSERT WITH CHECK (public.mb_is_admin_or_caja());
CREATE POLICY ventas_externas_update_admin ON public.ventas_externas
  FOR UPDATE USING (public.mb_is_admin()) WITH CHECK (public.mb_is_admin());
CREATE POLICY ventas_externas_delete_admin ON public.ventas_externas
  FOR DELETE USING (public.mb_is_admin());

DROP POLICY IF EXISTS coach_paquetes_select_roles ON public.coach_paquetes;
DROP POLICY IF EXISTS coach_paquetes_insert_admin_caja ON public.coach_paquetes;
DROP POLICY IF EXISTS coach_paquetes_update_admin_caja ON public.coach_paquetes;
DROP POLICY IF EXISTS coach_paquetes_delete_admin_recent_caja ON public.coach_paquetes;
CREATE POLICY coach_paquetes_select_roles ON public.coach_paquetes
  FOR SELECT USING (public.mb_is_admin_or_caja() OR public.mb_is_consulta_owner(asistente_id));
CREATE POLICY coach_paquetes_insert_admin_caja ON public.coach_paquetes
  FOR INSERT WITH CHECK (public.mb_is_admin_or_caja());
CREATE POLICY coach_paquetes_update_admin_caja ON public.coach_paquetes
  FOR UPDATE USING (public.mb_is_admin_or_caja()) WITH CHECK (public.mb_is_admin_or_caja());
CREATE POLICY coach_paquetes_delete_admin_recent_caja ON public.coach_paquetes
  FOR DELETE USING (
    public.mb_is_admin()
    OR (
      public.mb_current_role() = 'caja'::public.rol_usuario
      AND creado_en > now() - interval '15 minutes'
    )
  );

DROP POLICY IF EXISTS coach_sesiones_select_roles ON public.coach_sesiones;
DROP POLICY IF EXISTS coach_sesiones_insert_admin_caja ON public.coach_sesiones;
DROP POLICY IF EXISTS coach_sesiones_update_admin ON public.coach_sesiones;
DROP POLICY IF EXISTS coach_sesiones_delete_admin ON public.coach_sesiones;
CREATE POLICY coach_sesiones_select_roles ON public.coach_sesiones
  FOR SELECT USING (public.mb_is_admin_or_caja() OR public.mb_is_consulta_owner(asistente_id));
CREATE POLICY coach_sesiones_insert_admin_caja ON public.coach_sesiones
  FOR INSERT WITH CHECK (public.mb_is_admin_or_caja());
CREATE POLICY coach_sesiones_update_admin ON public.coach_sesiones
  FOR UPDATE USING (public.mb_is_admin()) WITH CHECK (public.mb_is_admin());
CREATE POLICY coach_sesiones_delete_admin ON public.coach_sesiones
  FOR DELETE USING (public.mb_is_admin());

DROP POLICY IF EXISTS socios_select_admin_caja ON public.socios;
DROP POLICY IF EXISTS socios_insert_admin ON public.socios;
DROP POLICY IF EXISTS socios_update_admin ON public.socios;
DROP POLICY IF EXISTS socios_delete_admin ON public.socios;
CREATE POLICY socios_select_admin_caja ON public.socios
  FOR SELECT USING (public.mb_is_admin_or_caja());
CREATE POLICY socios_insert_admin ON public.socios
  FOR INSERT WITH CHECK (public.mb_is_admin());
CREATE POLICY socios_update_admin ON public.socios
  FOR UPDATE USING (public.mb_is_admin()) WITH CHECK (public.mb_is_admin());
CREATE POLICY socios_delete_admin ON public.socios
  FOR DELETE USING (public.mb_is_admin());

DROP POLICY IF EXISTS periodos_select_admin_caja ON public.periodos;
DROP POLICY IF EXISTS periodos_insert_admin ON public.periodos;
DROP POLICY IF EXISTS periodos_update_admin ON public.periodos;
DROP POLICY IF EXISTS periodos_delete_admin ON public.periodos;
CREATE POLICY periodos_select_admin_caja ON public.periodos
  FOR SELECT USING (public.mb_is_admin_or_caja());
CREATE POLICY periodos_insert_admin ON public.periodos
  FOR INSERT WITH CHECK (public.mb_is_admin());
CREATE POLICY periodos_update_admin ON public.periodos
  FOR UPDATE USING (public.mb_is_admin()) WITH CHECK (public.mb_is_admin());
CREATE POLICY periodos_delete_admin ON public.periodos
  FOR DELETE USING (public.mb_is_admin());

DROP POLICY IF EXISTS adelantos_select_admin_caja ON public.adelantos_socios;
DROP POLICY IF EXISTS adelantos_insert_admin ON public.adelantos_socios;
DROP POLICY IF EXISTS adelantos_update_admin ON public.adelantos_socios;
DROP POLICY IF EXISTS adelantos_delete_admin ON public.adelantos_socios;
CREATE POLICY adelantos_select_admin_caja ON public.adelantos_socios
  FOR SELECT USING (public.mb_is_admin_or_caja());
CREATE POLICY adelantos_insert_admin ON public.adelantos_socios
  FOR INSERT WITH CHECK (public.mb_is_admin());
CREATE POLICY adelantos_update_admin ON public.adelantos_socios
  FOR UPDATE USING (public.mb_is_admin()) WITH CHECK (public.mb_is_admin());
CREATE POLICY adelantos_delete_admin ON public.adelantos_socios
  FOR DELETE USING (public.mb_is_admin());

DROP POLICY IF EXISTS liquidaciones_socios_select_admin_caja ON public.liquidaciones_socios;
DROP POLICY IF EXISTS liquidaciones_socios_insert_admin ON public.liquidaciones_socios;
DROP POLICY IF EXISTS liquidaciones_socios_update_admin ON public.liquidaciones_socios;
DROP POLICY IF EXISTS liquidaciones_socios_delete_admin ON public.liquidaciones_socios;
CREATE POLICY liquidaciones_socios_select_admin_caja ON public.liquidaciones_socios
  FOR SELECT USING (public.mb_is_admin_or_caja());
CREATE POLICY liquidaciones_socios_insert_admin ON public.liquidaciones_socios
  FOR INSERT WITH CHECK (public.mb_is_admin());
CREATE POLICY liquidaciones_socios_update_admin ON public.liquidaciones_socios
  FOR UPDATE USING (public.mb_is_admin()) WITH CHECK (public.mb_is_admin());
CREATE POLICY liquidaciones_socios_delete_admin ON public.liquidaciones_socios
  FOR DELETE USING (public.mb_is_admin());

DROP POLICY IF EXISTS liquidaciones_resumen_select_admin_caja ON public.liquidaciones_resumen_cuentas;
DROP POLICY IF EXISTS liquidaciones_resumen_insert_admin ON public.liquidaciones_resumen_cuentas;
DROP POLICY IF EXISTS liquidaciones_resumen_update_admin ON public.liquidaciones_resumen_cuentas;
DROP POLICY IF EXISTS liquidaciones_resumen_delete_admin ON public.liquidaciones_resumen_cuentas;
CREATE POLICY liquidaciones_resumen_select_admin_caja ON public.liquidaciones_resumen_cuentas
  FOR SELECT USING (public.mb_is_admin_or_caja());
CREATE POLICY liquidaciones_resumen_insert_admin ON public.liquidaciones_resumen_cuentas
  FOR INSERT WITH CHECK (public.mb_is_admin());
CREATE POLICY liquidaciones_resumen_update_admin ON public.liquidaciones_resumen_cuentas
  FOR UPDATE USING (public.mb_is_admin()) WITH CHECK (public.mb_is_admin());
CREATE POLICY liquidaciones_resumen_delete_admin ON public.liquidaciones_resumen_cuentas
  FOR DELETE USING (public.mb_is_admin());

DROP POLICY IF EXISTS auditoria_select_admin ON public.auditoria_financiera;
DROP POLICY IF EXISTS auditoria_insert_admin_caja ON public.auditoria_financiera;
DROP POLICY IF EXISTS auditoria_update_admin ON public.auditoria_financiera;
DROP POLICY IF EXISTS auditoria_delete_admin ON public.auditoria_financiera;
CREATE POLICY auditoria_select_admin ON public.auditoria_financiera
  FOR SELECT USING (public.mb_is_admin());
CREATE POLICY auditoria_insert_admin_caja ON public.auditoria_financiera
  FOR INSERT WITH CHECK (public.mb_is_admin_or_caja());
CREATE POLICY auditoria_update_admin ON public.auditoria_financiera
  FOR UPDATE USING (public.mb_is_admin()) WITH CHECK (public.mb_is_admin());
CREATE POLICY auditoria_delete_admin ON public.auditoria_financiera
  FOR DELETE USING (public.mb_is_admin());

DROP POLICY IF EXISTS configuracion_select_admin_caja ON public.configuracion_empresa;
DROP POLICY IF EXISTS configuracion_insert_admin ON public.configuracion_empresa;
DROP POLICY IF EXISTS configuracion_update_admin ON public.configuracion_empresa;
CREATE POLICY configuracion_select_admin_caja ON public.configuracion_empresa
  FOR SELECT USING (public.mb_is_admin_or_caja());
CREATE POLICY configuracion_insert_admin ON public.configuracion_empresa
  FOR INSERT WITH CHECK (public.mb_is_admin());
CREATE POLICY configuracion_update_admin ON public.configuracion_empresa
  FOR UPDATE USING (public.mb_is_admin()) WITH CHECK (public.mb_is_admin());

-- Views must obey the caller's RLS policies instead of bypassing them.
ALTER VIEW public.vista_cuentas_saldos SET (security_invoker = true);
ALTER VIEW public.vw_movimientos_generales SET (security_invoker = true);
REVOKE ALL ON public.vista_cuentas_saldos FROM anon;
REVOKE ALL ON public.vw_movimientos_generales FROM anon;
GRANT SELECT ON public.vista_cuentas_saldos TO authenticated;
GRANT SELECT ON public.vw_movimientos_generales TO authenticated;

-- ---------------------------------------------------------------------------
-- Financial RPC hardening.
-- Preserve existing financial math by moving the current functions behind
-- private internal names, then expose wrappers with role validation only.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.aplicar_saldo_favor_trx_impl(uuid, uuid, numeric)') IS NULL THEN
    ALTER FUNCTION public.aplicar_saldo_favor_trx(uuid, uuid, numeric)
      RENAME TO aplicar_saldo_favor_trx_impl;
  END IF;

  IF to_regprocedure('public.fn_cerrar_liquidacion_impl(uuid)') IS NULL THEN
    ALTER FUNCTION public.fn_cerrar_liquidacion(uuid)
      RENAME TO fn_cerrar_liquidacion_impl;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.aplicar_saldo_favor_trx(
  p_cuenta_id uuid,
  p_asistente_id uuid,
  p_monto numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.mb_is_admin() THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;

  PERFORM public.aplicar_saldo_favor_trx_impl(p_cuenta_id, p_asistente_id, p_monto);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_cerrar_liquidacion(p_periodo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.mb_is_admin() THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;

  PERFORM public.fn_cerrar_liquidacion_impl(p_periodo_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.aplicar_saldo_favor_trx_impl(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_cerrar_liquidacion_impl(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aplicar_saldo_favor_trx(uuid, uuid, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_cerrar_liquidacion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_saldo_favor_trx(uuid, uuid, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_cerrar_liquidacion(uuid) TO authenticated, service_role;
