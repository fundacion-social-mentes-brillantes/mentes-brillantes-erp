# ERP Fundación Social Gimnasio Emocional Mentes Brillantes

Sistema interno (Next.js + Supabase) para la gestión administrativa y financiera de la fundación: panel gerencial, cuentas por cobrar, movimientos de caja, egresos, socios, liquidaciones, donaciones y módulos operativos de asistentes.

## Funcionalidades actuales
- Autenticación Supabase y roles básicos (admin / caja / consulta).
- Dashboard con indicadores de ingresos, egresos, utilidad y cartera; gráfico de balance diario.
- Cuentas por cobrar: creación, edición, abonos, control de estado y sesiones coach asociadas.
- Movimientos de caja (pagos/abonos) con filtros, estados y anulaciones.
- Donaciones de asistentes (separadas de cartera, pero ingreso del período).
- Egresos con categorías y notas.
- Socios, adelantos y liquidaciones con PDF.
- Saldo a favor (anticipos) y su aplicación a cuentas.
- Exportes PDF del dashboard (html2canvas + jsPDF), tema claro/oscuro con tokens centralizados.

## Stack tecnológico
- Next.js 16 (React 19) con App Router.
- Supabase (Auth + Postgres).
- Tailwind CSS v4.
- Recharts, Lucide Icons.
- Vitest.

## Requisitos
- Node.js ≥ 18.18 y npm.
- Proyecto Supabase con URL y anon key configuradas.

## Instalación local
```bash
npm install
npm run dev
```
Configurar `.env.local` con:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY

## Scripts
- `npm run dev` — desarrollo
- `npm run build` — build producción
- `npm run start` — servidor producción local
- `npm run lint` — linting
- `npm run test` — Vitest (usa .tmp en Windows)

## Notas de base de datos / Supabase
- Esquema base en `supabase/schema.sql` (enums, perfiles, asistentes, cuentas_por_cobrar, pagos_abonos, donaciones_asistentes, egresos, periodos, socios).
- Objetos clave que deben existir en la BD:
  - Vista `vw_movimientos_generales` (ingresos/egresos consolidados, excluye anulados).
  - Tabla `movimientos_saldo_favor`.
  - Tabla `coach_paquetes` y `coach_sesiones`.
  - Tabla `liquidaciones_resumen_cuentas` (snapshot por método al cerrar período).
  - Trigger `actualizar_estado_cuenta` (excluye pagos anulados por estado o nota `[ANULADO]`).
  - RPC `fn_cerrar_liquidacion` (cierre atómico, genera snapshot y cierra período).
- Roles según `rol_usuario` (admin/caja/consulta).

## Reglas oficiales del negocio
1) Ingresos del período = abonos válidos + donaciones válidas. Las donaciones cuentan como ingreso y como base de utilidad repartible.  
2) Saldo a favor: los anticipos generan saldo a favor; su aplicación a una cuenta no crea ingreso nuevo (traslado interno de valor ya registrado).  
3) Egresos: todo egreso reduce utilidad del período. No usar egresos para adelantos/préstamos a socios.  
4) Adelantos/préstamos a socios: se gestionan en liquidaciones; se descuentan del neto a pagar al socio.  
5) Liquidación: utilidad del período = ingresos (abonos + donaciones) − egresos − adelantos; reparto según % de participación. Período cerrado no se edita.  
6) Auditoría: los cambios financieros deben ser trazables (quién, qué, cuánto, por qué).  
7) Borrado: en producción el admin puede borrar movimientos; es decisión operativa vigente (aunque menos conservadora contablemente).  
8) Anulados: pagos/abonos con `estado='anulado'` o notas con `[ANULADO]` no cuentan para estados ni ingresos.

## Estado confirmado actual de base de datos
- `vista_cuentas_saldos` filtra pagos anulados (estado = 'anulado' o notas con “[ANULADO]” no suman).
- `adelantos_socios` maneja `metodo_pago` (enum `metodo_pago`).
- `fn_cerrar_liquidacion` preagrega por `metodo_pago` antes de combinar, evitando duplicados.
- Lógica aprobada vigente: donaciones sí cuentan y se reparten; saldo a favor aplicado no es ingreso nuevo; egresos restan; adelantos restan; períodos cerrados no se editan.

## Estado actual
- CI: GitHub Actions (“CI Tests”) en verde.  
- Pruebas locales Windows: pueden seguir fallando por `spawn EPERM / esbuild` (antivirus/permisos sobre `.next`).  
- Build: `npm run build`.
- Tema claro/oscuro operativo con tokens en `globals.css`.

## Pendientes técnicos / diferencias entre documentación y base de datos
- Verificar en la BD que existan: `vw_movimientos_generales`, `movimientos_saldo_favor`, `liquidaciones_resumen_cuentas`, RPC `fn_cerrar_liquidacion`. Si faltan, crearlos según `supabase/schema.sql` y `docs/reglas-negocio-contables.md`.
- Alinear despliegues antiguos donde `pagos_abonos` no tenga columna `estado` o triggers que aún no excluyan `[ANULADO]`.
- Confirmar que `fn_cerrar_liquidacion` en la BD sea la versión con agregados por método (sin duplicar montos).
- Mitigar definitivamente `spawn EPERM` en Windows (permisos o antivirus sobre `.next`).

## Checklist de validación contable
- `vista_cuentas_saldos` = abonos válidos (excluye anulados).
- `total_ingresos` = abonos + donaciones.
- `total_salidas` = egresos + adelantos.
- `saldo_neto_periodo` = ingresos − salidas.
- Liquidación por método sin duplicados (preagregado por `metodo_pago`).

## Cambios aplicados el 2026-03-28
- Blindaje de reglas contables (anulados filtrados; saldo a favor no como ingreso; egresos/adelantos restan).
- Documentación oficial consolidada (README + reglas de negocio).
- CI verde en GitHub Actions (Vitest).
- Ajuste SQL: `vista_cuentas_saldos` filtra anulados.
- Ajuste SQL: `adelantos_socios.metodo_pago`.
- Ajuste SQL: `fn_cerrar_liquidacion` con preagregación por método.

## Documentación ampliada
Consultar `docs/reglas-negocio-contables.md` para el detalle completo de reglas financieras, exclusiones y flujo de liquidación.
