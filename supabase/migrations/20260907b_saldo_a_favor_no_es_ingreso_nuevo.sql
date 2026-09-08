-- Un movimiento de saldo a favor pagado CON saldo a favor nunca es ingreso nuevo.
--
-- El filtro de ingresos venia reconociendo movimientos internos por el TEXTO de
-- la nota. Es fragil: en la base hay 5 movimientos por $200.000 con la nota
-- "Reversion automatica por ELIMINACION del movimiento" que se contaban como
-- ingreso operativo, porque la lista solo nombraba las del "anticipo" (y ademas
-- las notas reales llevan tildes y mayusculas). No entro plata: solo se restauro
-- saldo al eliminar un movimiento.
--
-- La regla que se agrega no depende del texto y atrapa tambien las notas que
-- nadie previo. Se comprobo contra los datos reales que ningun ingreso legitimo
-- usa este metodo: los buenos entran por efectivo, nequi y otro; los unicos con
-- metodo 'saldo_a_favor' son exactamente los 5 erroneos.
--
-- Espeja la regla de src/lib/utils/contable.ts (esIngresoRealSaldoAFavor).
--
-- No altera ninguna liquidacion ya cerrada: esas cifras estan congeladas en
-- liquidaciones_socios y liquidaciones_resumen_cuentas. Solo cambia lo que se
-- calcule de aqui en adelante.
--
-- Se parchea la definicion VIVA por el drift de supabase/schema.sql. Idempotente.

DO $mig$
DECLARE
  v_def     TEXT;
  v_nueva   TEXT;
  v_cambios INT;
  v_ancla   TEXT := 'AND COALESCE(LOWER(msf.tipo), '''') = ''ingreso''';
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_cerrar_liquidacion_impl';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'No existe public.fn_cerrar_liquidacion_impl; revisar antes de continuar.';
  END IF;

  IF v_def LIKE '%COALESCE(LOWER(msf.metodo_pago::TEXT), '''') <> ''saldo_a_favor''%' THEN
    RAISE NOTICE 'La regla ya estaba aplicada; no se modifica nada.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_cambios
  FROM regexp_matches(v_def, 'AND COALESCE\(LOWER\(msf\.tipo\), ''''\) = ''ingreso''', 'g');

  IF v_cambios <> 1 THEN
    RAISE EXCEPTION 'Se esperaba 1 ancla y se encontraron %. La funcion viva no tiene la forma esperada; abortado sin tocar nada.', v_cambios;
  END IF;

  v_nueva := replace(
    v_def,
    v_ancla,
    v_ancla || chr(10) || '      AND COALESCE(LOWER(msf.metodo_pago::TEXT), '''') <> ''saldo_a_favor'''
  );

  EXECUTE v_nueva;
  RAISE NOTICE 'fn_cerrar_liquidacion_impl actualizada: el saldo a favor movido internamente ya no cuenta como ingreso.';
END
$mig$;
