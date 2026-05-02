# Seguridad del Cajero Telegram

## Principios

- Solo lectura financiera.
- No SQL libre generado por IA.
- No API keys en frontend.
- No service role fuera de servidor.
- No escrituras financieras automáticas.
- No mezclar usuarios del grupo.
- No convertir errores de consulta en ceros.

## Variables de entorno

El bot usa nombres de variables, nunca valores:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_ALLOWED_CHAT_ID`
- `TELEGRAM_ALLOWED_USER_IDS`
- `DEEPSEEK_TELEGRAM_API_KEY`
- `DEEPSEEK_TELEGRAM_BASE_URL`
- `DEEPSEEK_TELEGRAM_MODEL`
- `TELEGRAM_CAJERO_ENABLE_WRITE_ACTIONS`

## Migración pendiente

La memoria durable requiere ejecutar manualmente:

```bash
supabase db push
```

O copiar en SQL Editor el contenido de:

```text
supabase/migrations/20260502_add_telegram_bot_sessions.sql
```

No fue aplicada automáticamente desde este cambio.
