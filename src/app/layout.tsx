import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { hasEnvVars } from "@/lib/env";
import { SetupSupabase } from "@/components/setup/SetupSupabase";

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
    <html lang="es">
      <body className={inter.className}>
        {!hasEnvVars() ? <SetupSupabase /> : children}
      </body>
    </html>
  );
}
