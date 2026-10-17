import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // El respaldo completo incluye schema.sql: hay que empaquetarlo con esa ruta.
  outputFileTracingIncludes: {
    "/api/backup/[resource]": ["./supabase/schema.sql"],
  },
  // "Mi proceso" (/p/<enlace>): pagina personal de cada persona. Sin cache, fuera
  // de los buscadores y sin pasar su direccion a otros sitios.
  async headers() {
    return [
      {
        source: "/p/:token*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

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
