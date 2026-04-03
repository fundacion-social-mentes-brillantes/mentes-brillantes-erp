# Reglas de negocio contables

Esta es la referencia oficial de comportamiento financiero del ERP. Si codigo, SQL o documentacion difieren, prevalece esta regla.

## Definiciones
- Abono valido: pago que no esta anulado por `estado` ni por nota `[ANULADO]`.
- Donacion valida: donacion que no esta anulada por `estado` ni por nota `[ANULADO]`.
- Saldo a favor: valor ya ingresado previamente y disponible para futuras aplicaciones.
- Periodo cerrado: rango congelado; no admite nuevos cambios financieros.

## Reglas oficiales
1. Ingresos validos del periodo = abonos validos + donaciones validas.
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
- `ingresos_operativos = ingresos_cobrados + donaciones_periodo`
- `egresos_periodo = egresos validos`
- `utilidad_neta = ingresos_operativos - egresos_periodo`
- `valor_correspondiente = utilidad_neta * porcentaje_participacion`
- `valor_neto_pagar = valor_correspondiente - adelantos_descontados`

## Reportes y snapshot
- Dashboard, liquidaciones abiertas, liquidaciones cerradas y vistas SQL deben usar la misma definicion de ingresos validos, egresos validos y anulados.
- `liquidaciones_resumen_cuentas` guarda:
  - ingresos por metodo
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
- crear adelanto
- cerrar liquidacion
