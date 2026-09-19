// Sentry — lado servidor (Node). Se carga desde src/instrumentation.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://3d0b480a3d07df45c2746687f7d455e3@o4512113861263360.ingest.us.sentry.io/4512113870962688",

  // Trazas: 1.0 = se miden todas. El ERP tiene poco trafico, asi que
  // estamos muy por debajo del cupo gratis (5 M spans/mes).
  tracesSampleRate: 1.0,

  // Manda los console.log/error al panel, junto al error.
  enableLogs: true,

  // Profiling APAGADO a proposito: es lo unico que se cobra por uso.
  debug: false,
});
