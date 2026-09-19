import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withSentryConfig(nextConfig, {
  org: "gimnasioemocionalmb",
  project: "javascript-nextjs",

  // Sin ruido en la consola durante el build local.
  silent: !process.env.CI,

  // Sube los source maps a Sentry y los borra del paquete publico, para
  // que los errores se lean con nombres reales sin exponer el codigo.
  // Usa SENTRY_AUTH_TOKEN, que vive en las variables de entorno de Vercel.
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
