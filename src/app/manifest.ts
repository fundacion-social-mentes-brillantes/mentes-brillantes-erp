import type { MetadataRoute } from "next";

// Manifiesto de la PWA: permite instalar el ERP como app en Android e iOS
// ("Agregar a pantalla de inicio" / "Instalar app").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mentes Brillantes ERP",
    short_name: "Mentes ERP",
    description:
      "Sistema de gestión financiera y administrativa del Gimnasio Emocional Mentes Brillantes.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a1016",
    theme_color: "#0a1016",
    lang: "es",
    dir: "ltr",
    orientation: "any",
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
