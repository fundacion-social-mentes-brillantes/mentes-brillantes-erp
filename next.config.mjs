import { withSentryConfig } from "@sentry/nextjs/config";

// ------------------------------------------------------------------
// Cabeceras de seguridad para todas las paginas (revision del 17-oct-2026).
//
// - X-Frame-Options / frame-ancestors: nadie puede meter el ERP en un iframe
//   para enganar clics en acciones de plata.
// - nosniff, Referrer-Policy y Permissions-Policy: lo basico que faltaba.
// - Content-Security-Policy en modo REPORT-ONLY: no bloquea nada todavia; cada
//   violacion llega a Sentry. Cuando Sentry pase unos dias sin avisos, se
//   cambia la cabecera a Content-Security-Policy para que bloquee.
//
// Las rutas del OAuth del MCP (/api/mcp/oauth/...) NO llevan estas cabeceras:
// arman las suyas, mas estrictas y a la medida (form-action hacia el cliente
// que pide permiso, no-referrer).
// ------------------------------------------------------------------

const SUPABASE = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").origin;
  } catch {
    return "https://*.supabase.co";
  }
})();
const SUPABASE_WS = SUPABASE.replace(/^https:/, "wss:");

// Endpoint de seguridad de Sentry (la llave del DSN es publica: ya va en el navegador).
const SENTRY_INGEST = "https://o4512113861263360.ingest.us.sentry.io";
const SENTRY_CSP_REPORT = `${SENTRY_INGEST}/api/4512113870962688/security/?sentry_key=3d0b480a3d07df45c2746687f7d455e3`;

const CSP = [
  "default-src 'self'",
  // Next.js mete scripts en linea para hidratar la pagina.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE} ${SUPABASE_WS} ${SENTRY_INGEST}`,
  // La grabacion de errores de Sentry usa un worker propio.
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  `report-uri ${SENTRY_CSP_REPORT}`,
].join("; ");

const CABECERAS_SEGURIDAD = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: CSP },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // El respaldo completo incluye schema.sql: hay que empaquetarlo con esa ruta.
  outputFileTracingIncludes: {
    "/api/backup/[resource]": ["./supabase/schema.sql"],
  },
  async headers() {
    return [
      {
        // Todo menos el OAuth del MCP, que trae sus propias cabeceras.
        source: "/((?!api/mcp/oauth/).*)",
        headers: CABECERAS_SEGURIDAD,
      },
      {
        // "Mi proceso" (/p/<enlace>): pagina personal de cada persona. Sin cache,
        // fuera de los buscadores y sin pasar su direccion a otros sitios (esta
        // regla va despues: su Referrer-Policy reemplaza a la general).
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
