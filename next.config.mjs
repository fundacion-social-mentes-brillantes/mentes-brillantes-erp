import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withSentryConfig(nextConfig, {
  org: "gimnasioemocionalmb",
  project: "javascript-nextjs",

  // Sin ruido en la consola durante el build local.
  silent: !process.env.CI,

  // Source maps: pendiente, requiere un token de Sentry en Vercel.
  sourcemaps: { disable: true },
});
