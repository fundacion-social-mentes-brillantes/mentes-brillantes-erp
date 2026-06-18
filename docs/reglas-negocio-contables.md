# Reglas de negocio contables

Esta es la referencia oficial de comportamiento financiero del ERP. Si codigo, SQL o documentacion difieren, prevalece esta regla.

## Definiciones
- Abono valido: pago que no esta anulado por `estado` ni por nota `[ANULADO]`.
- Donacion valida: donacion que no esta anulada por `estado` ni por nota `[ANULADO]`.
- Saldo a favor: valor ya ingresado previamente y disponible para futuras aplicaciones.
- Periodo cerrado: rango congelado; no admite nuevos cambios financieros.

## Reglas oficiales
1. Ingresos validos del periodo = abonos validos + donaciones validas + ventas externas validas.
2. Aplicar saldo a favor a una cuenta no crea ingreso nuevo.
3. Utilidad del periodo = ingresos validos - egresos validos.
4. Adelantos a socios no reducen la utilidad; solo descuentan el neto a pagar del socio.
5. Si un pago supera el pendiente de la cuenta, solo se aplica lo necesario y el excedente pasa a saldo a favor.
6. Anulados no cuentan en estados de cuenta, ingresos, dashboard ni liquidaciones.
7. Al cerrar un periodo se congela el snapshot contable y el periodo deja de ser editable.
8. Toda accion financiera importante debe quedar auditada.

## Cuentas por cobrar
- `estado = pendiente` cuando no hay pagos validos.
- `estado = parcial` cuando hay pagos validos pero aun no cubren `valor_total`.
- `estado = pagado` cuando los pagos validos cubren o superan `valor_total`.
- El saldo pendiente se calcula solo con pagos validos.

## Sobrepago
- `saveCuenta` puede registrar un abono inicial.
- `saveAbono` puede exceder el pendiente.
- `editMontoAbono` tambien debe respetar la regla de sobrepago.
- En todos esos casos:
  - a la cuenta solo se aplica el valor necesario para cubrir el pendiente
  - el excedente se registra como `ingreso` en `movimientos_saldo_favor`
  - la cuenta nunca debe quedar con saldo pendiente negativo

## Saldo a favor
- Un ingreso a saldo a favor representa dinero ya recibido.
- Una aplicacion a cuenta representa consumo de saldo ya existente.
- La aplicacion genera:
  - un `pagos_abonos` con `metodo_pago='saldo_a_favor'` y `origen_fondos='saldo_a_favor'`
  - un `movimientos_saldo_favor.tipo='aplicacion'`
- Esa aplicacion no debe contarse como ingreso operativo del periodo.

## Liquidaciones
- `ingresos_cobrados = abonos validos`
- `donaciones_periodo = donaciones validas`
- `ventas_externas_periodo = ventas externas validas`
- `ingresos_operativos = ingresos_cobrados + donaciones_periodo + ventas_externas_periodo`
- `egresos_periodo = egresos validos`
- `utilidad_neta = ingresos_operativos - egresos_periodo`
- `valor_correspondiente = utilidad_neta * porcentaje_participacion`
- `valor_neto_pagar = valor_correspondiente - adelantos_descontados`

## Reportes y snapshot
- Dashboard, liquidaciones abiertas, liquidaciones cerradas y vistas SQL deben usar la misma definicion de ingresos validos, egresos validos y anulados.
- `liquidaciones_resumen_cuentas` guarda:
  - ingresos por metodo
  - ventas externas por metodo
  - egresos por metodo
  - adelantos por metodo como dato de neteo, no como reduccion de utilidad
- `saldo_neto_periodo` del resumen representa ingresos menos egresos, no utilidad menos adelantos.

## Auditoria
La columna oficial de auditoria es `motivo`.

Se audita como minimo:
- crear, editar y borrar cuenta
- crear, editar y anular abono
- aplicar saldo a favor
- generar saldo a favor por sobrepago
- crear, editar y borrar egreso
- crear, editar, anular y eliminar donacion
- crear, editar, anular y eliminar venta externa
- crear adelanto
- cerrar liquidacion
- editar la fecha fin de un periodo abierto

## Definicion operativa de ingresos (implementacion vigente)
El dashboard, el preview de liquidacion (TS) y `fn_cerrar_liquidacion` (SQL) calculan los ingresos del periodo de forma consistente como:

`ingresos_operativos = abonos validos (pago_directo) + ingresos reales de saldo a favor + donaciones validas + ventas externas validas`

- Abonos validos: pagos no anulados cuyo `origen_fondos`/`metodo_pago` no es `saldo_a_favor`.
- Ingresos reales de saldo a favor: movimientos `tipo='ingreso'` no anulados, excluyendo los ajustes internos del sistema (ver `PATRONES_NOTAS_AJUSTE_NO_INGRESO_SALDO_A_FAVOR` en `src/lib/utils/contable.ts`). Representan dinero realmente recibido (anticipos o sobrepagos).
- La APLICACION de saldo a favor a una cuenta NO es ingreso (regla 2): el pago espejo `origen_fondos='saldo_a_favor'` se excluye de los abonos.

## Saldo a favor: disponible vs ingreso real
Son dos conceptos distintos y no deben mezclarse:
- Saldo disponible (lo que el asistente puede aplicar) = balance de partida doble `SUM(ingresos) - SUM(aplicaciones)`, SIN filtrar anulados. Una reversion se registra como una aplicacion compensatoria (asiento de reverso), por lo que el balance neto ya queda correcto; filtrar `[ANULADO]` aqui haria doble conteo. Helpers: `calcularSaldoFavorDisponible` / `calcularSaldoFavorDisponibleRaw`.
- Ingreso real (lo que cuenta como ingreso del periodo) = `esIngresoRealSaldoAFavor` (excluye anulados y ajustes internos).

## Estado de cuenta: fuente de verdad
El estado (`pendiente`/`parcial`/`pagado`) de `cuentas_por_cobrar` lo recalcula el trigger DB `trg_estado_cuenta` (`actualizar_estado_cuenta`) en cada cambio de `pagos_abonos`: suma los pagos NO anulados (incluido saldo a favor) y aplica pagado/parcial/pendiente. El recalculo en codigo (`calcularEstadoCuentaDesdePagos`) espeja exactamente esa regla; ante cualquier diferencia, prevalece el trigger.

## Zona horaria de fechas
Los valores por defecto de fecha que el servidor escribe directamente (abono, cuenta, donacion, venta externa) usan la zona local de Colombia (`America/Bogota`, ver `src/lib/utils/fechas.ts`), para no registrar movimientos nocturnos con la fecha del dia siguiente (el servidor corre en UTC). La capa SQL (RPC con `CURRENT_DATE` y los rangos de `fn_cerrar_liquidacion`) usa UTC de forma uniforme; alinear toda la base de datos a la zona local es un cambio mayor pendiente.
