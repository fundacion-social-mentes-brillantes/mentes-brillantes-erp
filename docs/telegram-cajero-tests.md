# Pruebas del Cajero Telegram

La suite actual agrega cobertura para:

- Memoria por chat/usuario, TTL y selección pendiente.
- Router: consultas financieras sin palabra cajero, silencio en conversación normal, selección numérica, follow-up y preguntas compuestas.
- Planner de subtareas.
- Fechas naturales con fecha fija.
- Seguridad estática de tools de lectura.
- Acciones futuras bloqueadas.
- Adjuntos/OCR no activo.
- Redacción básica de secretos en trazas.

Comandos:

```bash
npm test
npm run build
```

`npm run lint` existe en `package.json`, pero con Next.js 16 puede requerir configuración adicional de lint si el proyecto no la tiene preparada.
