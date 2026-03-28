# Reglas de negocio contables — Mentes Brillantes ERP

Esta es la referencia oficial y operativa del comportamiento financiero del ERP. Si la base de datos o el código difieren, prevalece esta regla; cualquier desfase se registra en "Diferencias conocidas".

## Definiciones
- **Abono/pago válido**: pago que no está anulado (`estado != 'anulado'`) y cuyas notas no contienen `[ANULADO]`.
- **Donación válida**: donación con `estado != 'anulado'`.
- **Saldo a favor**: valor ya registrado como ingreso previo (anticipo). Su aplicación a cuentas no crea ingreso nuevo.
- **Período**: rango de fechas abierto o cerrado; al cerrarlo se genera snapshot contable.

## Reglas de cálculo
1) **Ingresos del período** = abonos válidos + donaciones válidas. Las donaciones forman parte de la utilidad repartible.
2) **Saldo a favor**: la aplicación de saldo a favor a una cuenta NO registra ingreso nuevo; es traslado interno de valor ya ingresado.
3) **Egresos**: todo egreso reduce la utilidad del período. No usar egresos para adelantos a socios.
4) **Adelantos a socios**: se gestionan en liquidaciones y se descuentan del neto a pagar del socio.
5) **Liquidación**: utilidad del período = ingresos (abonos + donaciones) - egresos - adelantos. Se reparte por porcentaje de participación. Período cerrado no se edita.
6) **Anulados**: cualquier movimiento marcado como anulado (estado o `[ANULADO]`) no cuenta para estados de cuenta ni para ingresos.

## Objetos de base de datos clave (estado confirmado)
- `pagos_abonos`: columna `estado`; trigger `actualizar_estado_cuenta` excluye anulados por estado y notas.
- `vista_cuentas_saldos`: excluye abonos anulados en el JOIN.
- `donaciones_asistentes`: donaciones separadas de cartera; `estado` controla validez.
- `movimientos_saldo_favor`: registra anticipos y aplicaciones de saldo a favor.
- `vw_movimientos_generales`: consolida ingresos/egresos; excluye anulados; usa `metodo_pago`.
- `adelantos_socios`: incluye `metodo_pago` (enum).
- `liquidaciones_resumen_cuentas`: snapshot por método de pago al cerrar un período.
- `fn_cerrar_liquidacion`: RPC atómica que preagrega por método, genera snapshot y cierra el período.

## Flujo por método de pago (resumen por cuenta)
- Ingresos: abonos válidos + donaciones válidas, agrupados por `metodo_pago`.
- Salidas: egresos válidos + adelantos a socios, agrupados por `metodo_pago`.
- Saldo neto por método = ingresos - salidas (valor esperado en cuenta al cierre).

## Política de períodos
- Período abierto: editable.
- Período cerrado: no editable; usar snapshot (`liquidaciones_resumen_cuentas`) para reportes.

## Auditoría y borrado
- Cambios financieros deben quedar trazables (quién, qué, cuánto, por qué).
- En producción, el admin puede borrar movimientos; es una decisión operativa vigente (menos conservadora contablemente).

## Diferencias conocidas / pendientes
- Ejecutar el script de diagnóstico (supabase/diagnostico_fase4.sql) al migrar entornos antiguos para validar vista/snapshot.
- Resolver definitivamente el problema de build `spawn EPERM` en Windows (permisos sobre `.next`).
