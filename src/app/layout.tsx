import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { hasEnvVars } from "@/lib/env";
import { SetupSupabase } from "@/components/setup/SetupSupabase";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mentes Brillantes ERP",
  description: "Sistema de gestión financiera y administrativa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" data-theme="light">
      <body className={inter.className}>
        <ThemeProvider>
          {!hasEnvVars() ? <SetupSupabase /> : children}
        </ThemeProvider>
      </body>
    </html>
  );
}
