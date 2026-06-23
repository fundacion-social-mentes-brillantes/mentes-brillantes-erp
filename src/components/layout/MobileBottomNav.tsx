"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, History, LayoutDashboard, Receipt, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/utils/authz";

type Item = { icon: typeof LayoutDashboard; label: string; href: string };

// Accesos rápidos para móvil (los 5 más usados). El menú completo sigue en el
// botón hamburguesa. Solo se muestra a admin y caja; "consulta" no lo necesita.
const items: Item[] = [
  { icon: LayoutDashboard, label: "Inicio", href: "/" },
  { icon: History, label: "Movim.", href: "/movimientos" },
  { icon: Receipt, label: "Cuentas", href: "/cuentas" },
  { icon: Users, label: "Asistentes", href: "/asistentes" },
  { icon: Bot, label: "IA", href: "/asistente-ia" },
];

export function MobileBottomNav({ role = "consulta" }: { role?: Role }) {
  const pathname = usePathname();
  if (role === "consulta") return null;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-[rgba(var(--border),0.7)] bg-[rgba(var(--surface-1),0.96)] backdrop-blur-xl shadow-strong"
      style={{ paddingBottom: "var(--safe-bottom)" }}
      aria-label="Navegación rápida"
    >
      <ul className="flex items-stretch justify-around px-1">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 min-h-[3.25rem] rounded-xl mx-0.5 transition-colors",
                  active
                    ? "text-[rgb(var(--warning))]"
                    : "text-[rgb(var(--text-muted))] active:bg-[rgba(var(--surface-2),0.8)]"
                )}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_6px_rgba(var(--gold),0.5)]")} />
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
