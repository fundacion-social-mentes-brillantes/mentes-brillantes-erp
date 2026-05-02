# Roadmap del bot Cajero Telegram

Este roadmap aterriza el documento de arquitectura del bot empresarial al ERP Mentes Brillantes. Las fases deben mantenerse pequeñas, verificables y con commits separados cuando sea posible.

## Fase 0. Auditoría y arquitectura

Estado: documentada.

- Leer PDF de arquitectura.
- Revisar README, reglas contables, schema, bot actual, asistente IA web y helpers financieros.
- Documentar módulos, riesgos y arquitectura objetivo.

## Fase 1.2. Memoria durable

- Crear contrato de memoria.
- Mantener fallback in-memory.
- Agregar store Supabase para `telegram_bot_sessions`.
- Crear migración SQL en repo, sin aplicarla automáticamente.
- TTL: selección 10 minutos, entidad activa 15 minutos, contexto general 45 minutos.
- Guardar solo estado técnico resumido, no conversaciones enormes ni comprobantes.

## Fase 2. Modularización

- Reducir `route.ts` a orquestador.
- Separar config, Telegram, activación, input, router, planner, policy, responders y traces.
- Corregir typo `AsisteнteRef` a `AsistenteRef`.
- Evitar cambios contables de comportamiento.

## Fase 3. Router y planner

- Reglas determinísticas primero.
- Seguimiento contextual con entidad activa.
- Clasificador IA solo para intención.
- Fallback de búsqueda global.
- Planner con máximo 3 a 6 subtareas.

## Fase 4. Tools solo lectura

- Crear catálogo tipado de tools internas.
- Todas las tools devuelven status/provenance/errores seguros.
- Prohibir escrituras financieras por prueba estática.

## Fase 5. Fechas naturales

- Centralizar fechas en `America/Bogota`.
- Soportar hoy, ayer, semanas, meses, trimestres, rangos y fechas explícitas.
- Tests con fecha anclada.

## Fase 6. Búsqueda global

- Buscar por asistentes, cuentas, pagos, saldo a favor, donaciones, ventas externas, egresos, coach y liquidaciones.
- Score simple y límites por módulo.
- Pedir más detalle si el término es corto.

## Fase 7. Resúmenes financieros

- Responder ingresos, egresos, utilidad estimada, métodos de pago y alertas.
- Usar regla oficial: abonos válidos + donaciones válidas + ventas externas válidas.
- Informar parcialidad si una consulta falla.

## Fase 8. Alertas

- Alertas con evidencia, tono prudente y máximo 5 por respuesta.
- No afirmar fraude.

## Fase 9. Respuestas humanas

- Plantillas cortas, claras y explicables.
- Orden: respuesta directa, dato clave, contexto, alerta, qué buscó, qué faltó.

## Fase 10. Acciones futuras desactivadas

- Preparar borradores con confirmación.
- No ejecutar escrituras.
- `TELEGRAM_CAJERO_ENABLE_WRITE_ACTIONS=false` por defecto.

## Fase 11. OCR/fotos futuro

- Detectar attachments.
- No guardar archivos ni registrar pagos.
- Responder que requiere revisión humana/fase futura.

## Fase 12. Tests

- Cubrir activación, router, planner, fechas, memoria, tools, responders, seguridad y flujo Telegram.

## Fase 13. Trazabilidad

- Logs técnicos sin secrets ni dumps financieros completos.
- Registrar intent, tools, status, duración, provenance y razón de silencio.

## Fase 14. Manual y seguridad

- Documentar uso, ejemplos, límites, variables de entorno, migraciones y checklist de operación.
