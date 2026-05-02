# Manual del Cajero Telegram

## Uso básico

- `/ayuda`
- `/id`
- `/estado nombre`
- `pagos de Alexandra`
- `saldo de Valeria`
- `cuanto debe Ana`
- `ultimo pago de Ana`
- `sesiones coach de Ana`
- `ventas externas de hoy`
- `egresos de este mes`
- `resumen de este mes`
- `busca nequi`

## En grupos

El bot responde cuando:

- lo mencionan,
- le responden directamente,
- usan comando slash,
- dicen cajero/caja/cajerito,
- o el texto parece una consulta financiera clara.

Debe guardar silencio ante mensajes normales como `ole`, `ya voy` o conversación familiar sin contexto.

## Límites actuales

- No registra pagos.
- No crea cuentas.
- No anula pagos.
- No aplica saldo a favor.
- No procesa OCR real.
- Puede preparar borradores futuros, pero no ejecuta escrituras.

## Pruebas manuales sugeridas

Ejecutar en Telegram:

```text
/ayuda
/id
cajero busca a Ana
1
y sus pagos
y cuánto debe
último pago de Ana
saldo a favor de Ana
sesiones coach de Ana
ventas externas de hoy
egresos de este mes
qué entró por nequi hoy
resumen de este mes
busca ZZZ999
registra un pago de 100000 a Ana por nequi
confirmo
cancela eso
```
