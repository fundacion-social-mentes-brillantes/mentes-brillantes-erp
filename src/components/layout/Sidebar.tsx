'use client'

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bot,
  CalendarHeart,
  Calculator,
  HeartHandshake,
  History,
  Home,
  LogOut,
  Receipt,
  Scale,
  Settings,
  ShoppingBag,
  TrendingDown,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/utils/authz";

type SidebarProps = {
  role?: Role;
};

type Item = { icon: typeof Home; label: string; corto: string; href: string };

const inicio: Item = { icon: Home, label: "Inicio", corto: "Inicio", href: "/" };
const movimientos: Item = { icon: History, label: "Movimientos", corto: "Movim.", href: "/movimientos" };
const cuentas: Item = { icon: Receipt, label: "Cuentas por Cobrar", corto: "Cuentas", href: "/cuentas" };
const asistentes: Item = { icon: Users, label: "Asistentes", corto: "Asistentes", href: "/asistentes" };
const coach: Item = { icon: HeartHandshake, label: "Sesiones Coach", corto: "Coach", href: "/sesiones-coach" };
const talleres: Item = { icon: CalendarHeart, label: "Talleres", corto: "Talleres", href: "/talleres" };
const ventas: Item = { icon: ShoppingBag, label: "Ventas Externas", corto: "Ventas", href: "/ventas-externas" };
const egresos: Item = { icon: TrendingDown, label: "Egresos", corto: "Egresos", href: "/egresos" };
const socios: Item = { icon: Scale, label: "Socios & Adelantos", corto: "Socios", href: "/socios" };
const liquidaciones: Item = { icon: Calculator, label: "Liquidaciones", corto: "Liquidar", href: "/liquidaciones" };
const ia: Item = { icon: Bot, label: "Asistente IA", corto: "IA", href: "/asistente-ia" };

const adminNav = [inicio, movimientos, cuentas, asistentes, coach, talleres, ventas, egresos, socios, liquidaciones, ia];
const cajaNav = [inicio, movimientos, cuentas, asistentes, coach, talleres, ventas, egresos, ia];
const consultaNav: Item[] = [{ icon: Home, label: "Mi Estado", corto: "Mi estado", href: "/mi-estado" }];

const EVENTO_ABRIR = "mb:abrir-menu";

/** Abre el menú completo del celular (lo usan el encabezado y la barra de abajo). */
export function abrirMenuCelular() {
  window.dispatchEvent(new Event(EVENTO_ABRIR));
}

function estaActivo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({ role = "consulta" }: SidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  // Al cambiar de pagina se cierra el menu. Se ajusta durante el render (patron
  // recomendado por React) en vez de un efecto que dibujaba dos veces.
  const [rutaAnterior, setRutaAnterior] = useState(pathname);
  if (pathname !== rutaAnterior) {
    setRutaAnterior(pathname);
    setIsOpen(false);
  }

  useEffect(() => {
    const abrir = () => setIsOpen(true);
    window.addEventListener(EVENTO_ABRIR, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR, abrir);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [isOpen]);

  const navItems = role === "consulta" ? consultaNav : role === "admin" ? adminNav : cajaNav;
  const showConfig = role === "admin";
  const showUsers = role === "admin";

  const itemRiel = (activo: boolean) =>
    cn(
      "flex w-full flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-xs font-medium transition-colors",
      activo ? "bg-acento/12 text-acento" : "text-gris hover:bg-suave hover:text-tinta"
    );

  return (
    <>
      {/* Computador: franja de íconos con su nombre corto */}
      <aside className="hidden w-[104px] shrink-0 flex-col items-center border-r border-linea bg-panel md:flex">
        <Link href="/" aria-label="Mentes Brillantes: inicio" className="grid h-16 w-full shrink-0 place-items-center">
          <Image src="/logo-gemb-simbolo.png" alt="Gimnasio Emocional Mentes Brillantes" width={62} height={36} className="h-9 w-auto" priority />
        </Link>
        <nav aria-label="Secciones" className="flex w-full flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2 visible-scrollbar">
          {navItems.map((item) => {
            const activo = estaActivo(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-label={item.label}
                aria-current={activo ? "page" : undefined}
                className={itemRiel(activo)}
              >
                <item.icon className="h-5 w-5" aria-hidden />
                <span className="w-full truncate text-center">{item.corto}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex w-full flex-col gap-1 border-t border-linea px-2 py-2">
          {showConfig && (
            <Link href="/configuracion" title="Configuración" aria-label="Configuración" className={itemRiel(pathname === "/configuracion")}>
              <Settings className="h-5 w-5" aria-hidden />
              <span>Ajustes</span>
            </Link>
          )}
          {showUsers && (
            <Link href="/configuracion/usuarios" title="Usuarios" aria-label="Usuarios" className={itemRiel(pathname === "/configuracion/usuarios")}>
              <UserCog className="h-5 w-5" aria-hidden />
              <span>Usuarios</span>
            </Link>
          )}
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              title="Cerrar Sesión"
              aria-label="Cerrar Sesión"
              className="flex w-full flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-xs font-medium text-gris transition-colors hover:bg-rojo/10 hover:text-rojo"
            >
              <LogOut className="h-5 w-5" aria-hidden />
              <span>Salir</span>
            </button>
          </form>
        </div>
      </aside>

      {/* Celular: el menú completo sube desde abajo */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <button type="button" aria-label="Cerrar menú" className="absolute inset-0 h-full w-full bg-black/50" onClick={() => setIsOpen(false)} />
          <div
            className="entra absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-2xl bg-panel px-4 pt-3"
            style={{ paddingBottom: "calc(1rem + var(--safe-bottom))" }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-linea" aria-hidden />
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Image src="/logo-gemb-simbolo.png" alt="" width={55} height={32} className="h-8 w-auto" />
                <div className="leading-tight">
                  <p className="text-base font-semibold text-tinta">Mentes Brillantes</p>
                  <p className="text-sm text-gris">Gimnasio Emocional</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Cerrar menú" className="grid h-10 w-10 place-items-center rounded-xl text-gris hover:bg-suave hover:text-tinta">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav aria-label="Secciones" className="grid grid-cols-3 gap-2">
              {navItems.map((item) => {
                const activo = estaActivo(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={activo ? "page" : undefined}
                    className={cn(
                      "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center text-sm font-medium transition-colors",
                      activo ? "border-acento/30 bg-acento/10 text-acento" : "border-linea text-tinta hover:bg-suave"
                    )}
                  >
                    <item.icon className="h-5 w-5" aria-hidden />
                    <span className="leading-tight">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="mt-4 divide-y divide-linea rounded-xl border border-linea">
              {showConfig && (
                <Link href="/configuracion" className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-tinta hover:bg-suave">
                  <Settings className="h-5 w-5 text-gris" aria-hidden /> Configuración
                </Link>
              )}
              {showUsers && (
                <Link href="/configuracion/usuarios" className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-tinta hover:bg-suave">
                  <UserCog className="h-5 w-5 text-gris" aria-hidden /> Usuarios
                </Link>
              )}
              <form action="/auth/signout" method="post">
                <button type="submit" className="flex w-full items-center gap-3 px-4 py-3.5 text-sm font-medium text-rojo hover:bg-rojo/10">
                  <LogOut className="h-5 w-5" aria-hidden /> Cerrar Sesión
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
