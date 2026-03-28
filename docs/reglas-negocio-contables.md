# Reglas de negocio contables — Mentes Brillantes ERP

Esta es la referencia oficial y operativa del comportamiento financiero del ERP. Si la base de datos o el código difieren, prevalece esta regla; el desfase debe listarse en “Diferencias conocidas”.

## Definiciones
- **Abono/pago válido**: pago que no está anulado (`estado != 'anulado'` y notas no contienen `[ANULADO]`).
- **Donación válida**: donación con `estado != 'anulado'`.
- **Saldo a favor**: valor ya registrado como ingreso previo (anticipo). Su aplicación a cuentas no crea ingreso nuevo.
- **Período**: rango de fechas abierto o cerrado; al cerrarlo se genera snapshot contable.

## Reglas de cálculo
1) **Ingresos del período** = abonos válidos + donaciones válidas. Las donaciones también forman parte de la utilidad repartible.
2) **Saldo a favor**: al aplicar saldo a favor a una cuenta NO se registra ingreso nuevo; es traslado interno de un valor ya ingresado.
3) **Egresos**: todo egreso reduce la utilidad del período. No usar egresos para adelantos a socios.
4) **Adelantos a socios**: se gestionan en liquidaciones y se descuentan del neto a pagar del socio.
5) **Liquidación**: utilidad del período = ingresos (abonos + donaciones) − egresos − adelantos. Se reparte por porcentaje de participación. Período cerrado no se edita.
6) **Anulados**: cualquier movimiento marcado como anulado (estado o `[ANULADO]`) no cuenta para estados de cuenta ni para ingresos.

## Objetos de base de datos clave
- `pagos_abonos`: debe tener columna `estado`; trigger `actualizar_estado_cuenta` excluye anulados.
- `donaciones_asistentes`: donaciones separadas de cartera; `estado` controla validez.
- `movimientos_saldo_favor`: registra anticipos y aplicaciones de saldo a favor.
- `vw_movimientos_generales`: consolida ingresos/egresos; excluye anulados; usa `metodo_pago`.
- `liquidaciones_resumen_cuentas`: snapshot por método de pago al cerrar un período.
- `fn_cerrar_liquidacion`: RPC que cierra período de forma atómica (genera snapshot y marca el período cerrado).

## Flujo por método de pago (resumen por cuenta)
- Ingresos: abonos válidos + donaciones válidas, agrupados por `metodo_pago`.
- Salidas: egresos válidos + adelantos a socios, agrupados por `metodo_pago`.
- Saldo neto por método = ingresos − salidas. Es el “valor esperado en cuenta” al cerrar período.

## Política de períodos
- Período abierto: editable.
- Período cerrado: no editable; usar snapshot (`liquidaciones_resumen_cuentas`) para reportes.

## Auditoría y borrado
- Cambios financieros deben quedar trazables (quién, qué, cuánto, por qué).
- En producción, el admin puede borrar movimientos; es una decisión operativa vigente (menos conservadora contablemente).

## Diferencias conocidas / pendientes
- Verificar en la BD la existencia/versión de: `vw_movimientos_generales`, `liquidaciones_resumen_cuentas`, `fn_cerrar_liquidacion`.
- Validar que `pagos_abonos` tenga columna `estado` y que triggers en cada despliegue excluyan `[ANULADO]`.
- Resolver definitivamente el problema de build `spawn EPERM` en Windows (permisos sobre `.next`).
