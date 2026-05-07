'use client'

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bot,
  Calculator,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings,
  ShoppingBag,
  TrendingDown,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/utils/authz";

type SidebarProps = {
  role?: Role;
};

const adminNav = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: Bot, label: "Asistente IA", href: "/asistente-ia" },
  { icon: History, label: "Movimientos", href: "/movimientos" },
  { icon: Users, label: "Asistentes", href: "/asistentes" },
  { icon: Receipt, label: "Cuentas por Cobrar", href: "/cuentas" },
  { icon: ShoppingBag, label: "Ventas Externas", href: "/ventas-externas" },
  { icon: TrendingDown, label: "Egresos", href: "/egresos" },
  { icon: Wallet, label: "Socios & Adelantos", href: "/socios" },
  { icon: Calculator, label: "Liquidaciones", href: "/liquidaciones" },
];

const consultaNav = [
  { icon: LayoutDashboard, label: "Mi Estado", href: "/mi-estado" },
];

const cajaNav = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: Bot, label: "Asistente IA", href: "/asistente-ia" },
  { icon: History, label: "Movimientos", href: "/movimientos" },
  { icon: Users, label: "Asistentes", href: "/asistentes" },
  { icon: Receipt, label: "Cuentas por Cobrar", href: "/cuentas" },
  { icon: ShoppingBag, label: "Ventas Externas", href: "/ventas-externas" },
  { icon: TrendingDown, label: "Egresos", href: "/egresos" },
];

export function Sidebar({ role = "consulta" }: SidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const navItems = role === "consulta" ? consultaNav : role === "admin" ? adminNav : cajaNav;
  const showConfig = role === "admin";
  const showUsers = role === "admin";

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="md:hidden fixed top-3 left-4 z-50 p-2 bg-[rgb(var(--surface-1))] text-[rgb(var(--text-primary))] border border-[rgba(var(--border),0.75)] rounded-xl shadow-soft"
        aria-label="Abrir navegación"
      >
        <Menu className="w-5 h-5" />
      </button>

      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/55 z-40 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed md:static inset-y-0 left-0 z-50 w-72 bg-[rgb(var(--surface-1))] text-[rgb(var(--text-primary))] flex flex-col h-screen border-r border-[rgba(var(--border),0.65)] transition-transform duration-300 ease-in-out shadow-strong md:shadow-none overflow-hidden",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top,rgba(var(--gold),0.18),transparent_18rem),linear-gradient(180deg,rgba(var(--sidebar-backdrop),0.96),rgba(var(--surface-1),0.94))]" />

        <div className="relative min-h-24 flex items-center justify-between px-5 border-b border-[rgba(var(--border),0.55)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative h-14 w-14 shrink-0 rounded-2xl border border-[rgba(var(--gold),0.38)] bg-[rgba(var(--surface-1),0.62)] shadow-soft overflow-hidden">
              <Image
                src="/logo-mentes-brillantes.png"
                alt="Gimnasio Emocional Mentes Brillantes"
                fill
                className="object-contain p-1.5"
                priority
                sizes="56px"
              />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[rgb(var(--warning))] font-semibold">ERP Financiero</p>
              <div className="font-bold text-[rgb(var(--text-primary))] text-base tracking-tight leading-tight">
                Mentes Brillantes
              </div>
              <p className="text-xs text-[rgb(var(--text-muted))] truncate">Gimnasio Emocional</p>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="md:hidden p-1 text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-primary))]" aria-label="Cerrar navegación">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="relative flex-1 overflow-y-auto py-5 visible-scrollbar">
          <ul className="space-y-1.5 px-3">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border border-transparent",
                      isActive
                        ? "bg-[linear-gradient(135deg,rgba(var(--gold),0.18),rgba(var(--accent),0.13))] text-[rgb(var(--text-primary))] border-[rgba(var(--gold),0.42)] shadow-soft"
                        : "hover:bg-[rgba(var(--surface-2),0.76)] hover:text-[rgb(var(--text-primary))] text-[rgb(var(--text-muted))]"
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-8 w-8 place-items-center rounded-lg border transition-colors",
                        isActive
                          ? "border-[rgba(var(--gold),0.38)] bg-[rgba(var(--gold),0.16)] text-[rgb(var(--warning))]"
                          : "border-[rgba(var(--border),0.45)] bg-[rgba(var(--surface-1),0.42)] group-hover:border-[rgba(var(--gold),0.28)]"
                      )}
                    >
                      <item.icon className="w-4 h-4" />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="relative p-4 border-t border-[rgba(var(--border),0.55)]">
          <ul className="space-y-1.5">
            {showConfig && (
              <li>
                <Link
                  href="/configuracion"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-[rgba(var(--surface-2),0.76)] hover:text-[rgb(var(--text-primary))] text-[rgb(var(--text-muted))] transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Configuración
                </Link>
              </li>
            )}
            {showUsers && (
              <li>
                <Link
                  href="/configuracion/usuarios"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-[rgba(var(--surface-2),0.76)] hover:text-[rgb(var(--text-primary))] text-[rgb(var(--text-muted))] transition-colors"
                >
                  <Users className="w-4 h-4" />
                  Usuarios
                </Link>
              </li>
            )}
            <li>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[rgb(var(--danger))] hover:bg-[rgba(var(--danger),0.12)] transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Cerrar Sesión
                </button>
              </form>
            </li>
          </ul>
        </div>
      </aside>
    </>
  );
}
