# ERP Fundacion Social Gimnasio Emocional Mentes Brillantes

Sistema interno en Next.js + Supabase para la gestion administrativa y financiera de la fundacion: dashboard gerencial, cuentas por cobrar, movimientos de caja, donaciones, egresos, socios, liquidaciones y modulos operativos de asistentes.

## Funcionalidades actuales
- Autenticacion Supabase con roles `admin`, `caja` y `consulta`.
- Dashboard con ingresos, donaciones, egresos, utilidad y cartera.
- Cuentas por cobrar con abonos, saldo pendiente, saldo a favor y paquetes coach.
- Historial general de movimientos con anulacion y eliminacion controlada.
- Donaciones y egresos con auditoria.
- Socios, periodos, adelantos y liquidaciones con exporte.

## Stack
- Next.js 16 + React 19
- Supabase (Auth + Postgres)
- Tailwind CSS v4
- Vitest

## Scripts
- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run test`

## Base de datos
El contrato de referencia esta en [supabase/schema.sql](/C:/mentes-brillantes-erp/supabase/schema.sql).

Objetos clave que deben existir en la BD:
- `vista_cuentas_saldos`
- `vw_movimientos_generales`
- `movimientos_saldo_favor`
- `coach_paquetes`
- `coach_sesiones`
- `liquidaciones_resumen_cuentas`
- `auditoria_financiera`
- `configuracion_empresa`
- `aplicar_saldo_favor_trx`
- `fn_cerrar_liquidacion`

## Reglas oficiales del negocio
1. Ingresos validos del periodo = abonos validos + donaciones validas.
2. Aplicar saldo a favor a una cuenta no crea ingreso nuevo.
3. Utilidad del periodo = ingresos validos - egresos validos.
4. Adelantos a socios no reducen la utilidad; solo descuentan el neto a pagar del socio.
5. Si un pago supera el pendiente, solo se aplica lo necesario a la cuenta y el excedente va a saldo a favor.
6. Movimientos anulados por `estado='anulado'` o por nota `[ANULADO]` no cuentan.
7. Un periodo cerrado queda congelado y no debe aceptar cambios financieros.
8. Cambios financieros importantes deben quedar auditados.

## Liquidaciones
- Base repartible: utilidad del periodo.
- `ingresos_operativos = abonos validos + donaciones validas`
- `egresos_periodo = egresos validos`
- `utilidad_neta = ingresos_operativos - egresos_periodo`
- `valor_neto_pagar = valor_correspondiente - adelantos_del_socio`

## Saldo a favor
- Un anticipo o sobrepago genera un movimiento `ingreso` en `movimientos_saldo_favor`.
- Una aplicacion a cuenta genera un movimiento `aplicacion` y un pago espejo en `pagos_abonos`.
- La aplicacion de saldo a favor no debe contarse como ingreso operativo.

## Estado actual
- Liquidaciones abiertas y cerradas usan la misma base contable.
- Dashboard y cuentas filtran anulados con la misma regla.
- `saveCuenta` registra abono inicial real y sobrepago a saldo a favor.
- `saveAbono` y `editMontoAbono` respetan la regla oficial de sobrepago.
- Historial general bloquea la edicion/anulacion/eliminacion de `aplicacion_saldo`.

## Documentacion ampliada
Ver [docs/reglas-negocio-contables.md](/C:/mentes-brillantes-erp/docs/reglas-negocio-contables.md).
