// Sentry — lado edge (middleware.ts corre aqui)
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://3d0b480a3d07df45c2746687f7d455e3@o4512113861263360.ingest.us.sentry.io/4512113870962688",
  tracesSampleRate: 1.0,
  enableLogs: true,
  debug: false,
});
