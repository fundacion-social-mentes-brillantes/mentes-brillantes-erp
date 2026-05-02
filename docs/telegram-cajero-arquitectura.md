# Arquitectura del bot Cajero Telegram

## Objetivo

El bot `@cajero_mb_pagos_bot` debe funcionar como asistente interno de consulta para el grupo PAGOS del ERP Mentes Brillantes. La arquitectura objetivo sigue el documento de referencia `Arquitectura para un bot de IA realmente inteligente en sistemas empresariales`: el modelo no decide infraestructura ni consulta SQL libre; el sistema decide entre rutas, tools internas cerradas y respuestas seguras.

## Estado actual auditado

- Entrada: `src/app/api/telegram/cajero/route.ts` recibe webhooks, valida `TELEGRAM_WEBHOOK_SECRET`, aplica allowlist por chat/user y responde con `sendMessage`.
- Seguridad: el bot es solo lectura financiera. No debe registrar pagos, crear cuentas, anular movimientos, cerrar periodos ni ejecutar RPC financieras.
- Memoria: existe `src/lib/telegram-cajero/memory.ts` con `Map` por `chat_id:user_id`, selección pendiente y contexto básico; es útil como fallback, pero no es durable para serverless.
- Tipos: existe `src/lib/telegram-cajero/types.ts`, con intents de persona, resumen, egresos, ventas externas y búsqueda global.
- Contabilidad: las reglas oficiales viven en `docs/reglas-negocio-contables.md`; helpers críticos están en `src/lib/utils/contable.ts` y `src/lib/utils/liquidaciones.ts`.
- Asistente IA web: `src/lib/asistente-ia/context.ts` y `src/lib/asistente-ia/contabilidad.ts` ya implementan consultas estructuradas, errores explícitos y lectura de liquidaciones.
- Base de datos: `supabase/schema.sql` incluye `pagos_abonos`, `cuentas_por_cobrar`, `movimientos_saldo_favor`, `donaciones_asistentes`, `ventas_externas`, `egresos`, coach, liquidaciones y conversaciones del asistente IA web.

## Riesgos principales

- `route.ts` concentra demasiada inteligencia y consultas directas; dificulta pruebas y auditoría.
- La memoria en `Map` se pierde entre instancias/serverless y puede fallar en producción.
- Algunas consultas actuales no revisan `error` de Supabase antes de calcular, lo que puede convertir fallos en respuestas vacías.
- La búsqueda global actual es útil pero básica, con límites y provenance todavía débiles.
- Hay deuda de encoding en varios textos y un typo de tipo (`AsisteнteRef`) con letra cirílica.

## Arquitectura objetivo

```text
Telegram webhook
-> adaptador Telegram
-> validación de webhook
-> autorización por chat/user
-> normalización de input
-> política de activación en grupo
-> loader de memoria
-> router híbrido
-> planner
-> policy engine
-> tool gateway seguro
-> tools internas solo lectura
-> agregador/análisis
-> alertas/resúmenes
-> generador de respuesta humana
-> writer de memoria
-> trazas técnicas
-> respuesta a Telegram
```

## Módulos recomendados

- `config.ts`: variables de entorno, sin exponer secrets.
- `telegram.ts`: tipos del canal, `sendMessage`, parsing de updates y attachments.
- `activation.ts`: cuándo responder en grupo y cuándo guardar silencio.
- `input.ts`: normalización, comandos, texto natural, multilínea.
- `memory/`: contrato de memoria, fallback en memoria, store Supabase.
- `router.ts`: reglas determinísticas, seguimiento contextual, IA y fallback.
- `planner.ts`: descomposición de preguntas compuestas con límite de subtareas.
- `policy.ts`: solo lectura, permisos, riesgos, bloqueo de escrituras.
- `dates.ts`: fechas naturales auditables en `America/Bogota`.
- `tools/`: catálogo de tools cerradas solo lectura.
- `responders.ts`: plantillas humanas y explicables.
- `traces/`: trazas técnicas sin secrets ni dumps financieros completos.
- `actions/`: borradores futuros de acciones, desactivados por defecto.

## Reglas contables que el bot debe respetar

- Ingresos válidos = abonos válidos + donaciones válidas + ventas externas válidas.
- Aplicaciones de saldo a favor no crean ingreso nuevo.
- Anulados no cuentan.
- Egresos activos cuentan como salida operativa.
- Periodos cerrados se leen desde snapshot.
- Errores de consulta se informan como parcialidad; no se convierten en cero.

## Política de seguridad

- No SQL libre generado por IA.
- No tools genéricas tipo `runAnything`.
- No `insert`, `update`, `delete`, `upsert` ni `rpc` en tools de lectura financiera.
- No service role en cliente.
- No logs con tokens, secrets o API keys.
- No mezclar memoria entre usuarios: la clave incluye canal, chat y usuario.
- En grupos, responder solo si hay activación explícita, consulta financiera clara o contexto pendiente del mismo usuario.

## Provenance mínimo

Cada tool debe devolver:

- `toolName`
- `status`
- `queryScope`
- `provenance.sources`
- `provenance.asOf`
- `resultCount`
- `alerts`
- `userSafeErrors`

Así la respuesta final puede decir qué consultó, qué faltó y si el resultado es parcial.
