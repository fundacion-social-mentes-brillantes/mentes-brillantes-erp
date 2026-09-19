// Sentry — lado navegador
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://3d0b480a3d07df45c2746687f7d455e3@o4512113861263360.ingest.us.sentry.io/4512113870962688",

  tracesSampleRate: 1.0,
  enableLogs: true,

  // Grabacion de sesion SOLO cuando hay un error: se ve que hizo la
  // persona justo antes de que se rompiera. Cupo gratis: 50 al mes.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],

  debug: false,
});

// Mide los cambios de pantalla del App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
