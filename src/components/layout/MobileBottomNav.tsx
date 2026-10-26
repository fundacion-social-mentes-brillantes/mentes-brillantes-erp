"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, Home, Menu, Receipt, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/utils/authz";
import { abrirMenuCelular } from "@/components/layout/Sidebar";

type Item = { icon: typeof Home; label: string; href: string };

// Accesos rápidos para móvil (los 4 más usados) y "Más", que abre el menú completo.
// Solo se muestra a admin y caja; "consulta" no lo necesita.
const items: Item[] = [
  { icon: Home, label: "Inicio", href: "/" },
  { icon: History, label: "Movimientos", href: "/movimientos" },
  { icon: Receipt, label: "Cuentas", href: "/cuentas" },
  { icon: Users, label: "Asistentes", href: "/asistentes" },
];

export function MobileBottomNav({ role = "consulta" }: { role?: Role }) {
  const pathname = usePathname();
  if (role === "consulta") return null;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
  const enAlgunAcceso = items.some((i) => isActive(i.href));

  const clase = (activo: boolean) =>
    cn(
      "flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
      activo ? "text-acento" : "text-gris"
    );
  const pastilla = (activo: boolean) =>
    cn("grid h-7 w-12 place-items-center rounded-full transition-colors", activo && "bg-acento/12");

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-linea bg-panel md:hidden"
      style={{ paddingBottom: "var(--safe-bottom)" }}
      aria-label="Navegación rápida"
    >
      <ul className="grid grid-cols-5 px-1 pt-1">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link href={item.href} className={clase(active)} aria-current={active ? "page" : undefined}>
                <span className={pastilla(active)}>
                  <item.icon className="h-5 w-5" aria-hidden />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button type="button" onClick={abrirMenuCelular} className={cn(clase(!enAlgunAcceso), "w-full")}>
            <span className={pastilla(!enAlgunAcceso)}>
              <Menu className="h-5 w-5" aria-hidden />
            </span>
            Más
          </button>
        </li>
      </ul>
    </nav>
  );
}
