'use client'

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { 
  LayoutDashboard, 
  Users, 
  Wallet, 
  Receipt, 
  TrendingDown, 
  Calculator,
  Settings,
  LogOut,
  Menu,
  X,
  History
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: History, label: "Movimientos", href: "/movimientos" },
  { icon: Users, label: "Asistentes", href: "/asistentes" },
  { icon: Receipt, label: "Cuentas por Cobrar", href: "/cuentas" },
  { icon: TrendingDown, label: "Egresos", href: "/egresos" },
  { icon: Wallet, label: "Socios & Adelantos", href: "/socios" },
  { icon: Calculator, label: "Liquidaciones", href: "/liquidaciones" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Close sidebar on route change on mobile
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile Toggle Button */}
      <button 
        onClick={() => setIsOpen(true)}
        className="md:hidden fixed top-3 left-4 z-50 p-2 bg-zinc-950 text-white rounded-md shadow-md"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:static inset-y-0 left-0 z-50 w-64 bg-zinc-950 text-zinc-300 flex flex-col h-screen border-r border-zinc-800 transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-zinc-800">
          <div className="font-bold text-white text-lg tracking-tight">
            Mentes Brillantes
          </div>
          <button onClick={() => setIsOpen(false)} className="md:hidden p-1 text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                      isActive 
                        ? "bg-zinc-800 text-white" 
                        : "hover:bg-zinc-800/50 hover:text-white"
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-zinc-800">
          <ul className="space-y-1">
            <li>
              <Link
                href="/configuracion"
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium hover:bg-zinc-800/50 hover:text-white transition-colors"
              >
                <Settings className="w-4 h-4" />
                Configuración
              </Link>
            </li>
            <li>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
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
