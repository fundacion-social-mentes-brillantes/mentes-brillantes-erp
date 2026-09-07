-- Un "Ajuste de saldo a favor por edicion del abono" que entro por dinero real
-- (efectivo, Nequi, Daviplata) SI es ingreso del periodo.
--
-- Al subir el monto de un abono ya registrado, el excedente lo acaba de entregar
-- la persona; el sistema le pone "Ajuste" a la nota y fn_cerrar_liquidacion lo
-- descartaba junto con los ajustes internos de verdad. El mismo dinero registrado
-- de una sola vez si contaba (su nota dice "sobrepago"), asi que la cifra dependia
-- del orden en que se escribiera. Los demas patrones (aplicaciones y reversiones)
-- siempre mueven saldo dentro de la casa y siguen excluidos.
--
-- Espeja la regla de src/lib/utils/contable.ts (esIngresoRealSaldoAFavor).
--
-- Se aplica con regexp_replace sobre la definicion VIVA en vez de reescribir la
-- funcion entera, porque supabase/schema.sql esta desincronizado con produccion:
-- reescribirla desde el repo revertiria el endurecimiento de 20260514 en silencio.
-- Es idempotente: si el OR ya esta, no vuelve a insertarlo.

DO $mig$
DECLARE
  v_def        TEXT;
  v_nueva      TEXT;
  v_cambios    INT;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_cerrar_liquidacion_impl';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'No existe public.fn_cerrar_liquidacion_impl; revisar antes de continuar.';
  END IF;

  -- Ya aplicada: no hacer nada.
  IF v_def LIKE '%Ajuste de saldo a favor por edicion del abono%OR COALESCE(LOWER(msf.metodo_pago%' THEN
    RAISE NOTICE 'La regla ya estaba aplicada; no se modifica nada.';
    RETURN;
  END IF;

  v_nueva := regexp_replace(
    v_def,
    'AND msf\.notas NOT ILIKE ''%Ajuste de saldo a favor por edici(ó|o)n del abono%''',
    'AND (msf.notas NOT ILIKE ''%Ajuste de saldo a favor por edici\1n del abono%'''
      || ' OR COALESCE(LOWER(msf.metodo_pago::TEXT), '''') NOT IN ('''', ''saldo_a_favor''))',
    'g'
  );

  SELECT count(*) INTO v_cambios
  FROM regexp_matches(v_nueva, 'OR COALESCE\(LOWER\(msf\.metodo_pago::TEXT\), ''''\) NOT IN \('''', ''saldo_a_favor''\)', 'g');

  IF v_cambios <> 2 THEN
    RAISE EXCEPTION 'Se esperaban 2 sustituciones y se hicieron %. La funcion viva no tiene la forma esperada; abortado sin tocar nada.', v_cambios;
  END IF;

  EXECUTE v_nueva;
  RAISE NOTICE 'fn_cerrar_liquidacion_impl actualizada: los ajustes por edicion de abono pagados con dinero real ya cuentan como ingreso.';
END
$mig$;
