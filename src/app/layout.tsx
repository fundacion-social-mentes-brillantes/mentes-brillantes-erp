import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import { hasEnvVars } from "@/lib/env";
import { SetupSupabase } from "@/components/setup/SetupSupabase";
import { SCRIPT_APARIENCIA, ThemeProvider } from "@/components/theme/ThemeProvider";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

// Una sola letra para todo: grotesca de periódico, directa y clara en cifras y botones.
const letra = Schibsted_Grotesk({ subsets: ["latin", "latin-ext"], variable: "--letra", display: "swap" });

export const metadata: Metadata = {
  applicationName: "Finanzas GEMB",
  title: "Mentes Brillantes ERP",
  description: "Sistema de gestión financiera y administrativa",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Finanzas GEMB",
  },
  // Compatibilidad con iOS antiguos (la meta moderna es mobile-web-app-capable).
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/favicon-64.png", sizes: "64x64", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2ecef" },
    { media: "(prefers-color-scheme: dark)", color: "#181116" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: el script de la apariencia pone el modo y los colores
    // en <html> antes de que React llegue, a propósito.
    <html lang="es" className={letra.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_APARIENCIA }} />
      </head>
      <body>
        <ThemeProvider>
          {!hasEnvVars() ? <SetupSupabase /> : children}
          <InstallPrompt />
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
