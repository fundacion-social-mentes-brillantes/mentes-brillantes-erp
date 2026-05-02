# Tools internas del Cajero Telegram

Las tools del bot viven en `src/lib/telegram-cajero/tools`. Son APIs internas cerradas: reciben argumentos tipados, consultan tablas conocidas y devuelven `ToolResult`.

## Contrato

Cada tool devuelve:

- `toolName`
- `status`: `ok`, `empty`, `partial`, `ambiguous`, `forbidden` o `error`
- `queryScope`
- `provenance.sources`
- `provenance.asOf`
- `resultCount`
- `data`
- `alerts`
- `explanationHints`
- `userSafeErrors`
- `riskLevel`
- `requiresConfirmation`

## Tools iniciales

- `searchPerson`
- `getPersonFinancialStatus`
- `getPersonPayments`
- `getPersonLastPayment`
- `getSummary`
- `getAlerts`
- `searchGlobal`
- `explainPreviousResult`

También existen aliases para módulos futuros: saldos abiertos, saldo a favor, donaciones, coach, egresos y ventas externas.

## Seguridad

- Las tools de lectura no contienen `.insert(`, `.update(`, `.delete(`, `.upsert(` ni `.rpc(`.
- Los errores de consulta devuelven `status: "error"` o `status: "partial"`; no se convierten en cero.
- Los resultados tienen límites y provenance.
