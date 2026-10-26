'use client'

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Bell, Search, AlertCircle, Clock, Menu, X } from "lucide-react";
import { BotonApariencia } from "@/components/theme/EditorApariencia";
import { BuscadorGlobal } from "@/components/layout/BuscadorGlobal";
import { createClient } from "@/lib/supabase/client";
import { filtrarPagosValidosCuentas } from "@/lib/utils/contable";
import { pesos } from '@/lib/utils/pesos'
import { cn } from "@/lib/utils";
import { abrirMenuCelular } from "@/components/layout/Sidebar";

type AlertItem = {
  title: string;
  description?: string;
  href: string;
  icon?: "alert" | "clock";
};

type CuentaParaAviso = {
  id: string;
  valor_total: number;
  asistentes: { nombre: string } | null;
  pagos_abonos: Array<{ monto: number; estado: string | null; notas: string | null }> | null;
};

export function Header({ userEmail, userRole = 'user' }: { userEmail?: string, userRole?: string }) {
  const initial = userEmail ? userEmail.charAt(0).toUpperCase() : 'U';
  const pathname = usePathname();
  // En el Inicio el encabezado se funde con la franja de color y el buscador grande vive ahí.
  const enInicio = pathname === "/";
  const canUseGlobalSearch = userRole === "admin" || userRole === "caja";
  const canSeeOperationalAlerts = userRole === "admin" || userRole === "caja";
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [buscarEnCelular, setBuscarEnCelular] = useState(false);
  const avisosRef = useRef<HTMLDivElement>(null);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const loadAlerts = async () => {
      if (!supabase || !canSeeOperationalAlerts) return;
      setLoadingAlerts(true);

      const today = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);
      const thirtyStr = thirtyDaysAgo.toISOString().split("T")[0];

      // Cuentas pendientes (top 5)
      const { data: pendientes } = await supabase
        .from("cuentas_por_cobrar")
        .select("id, valor_total, fecha_emision, asistentes(nombre), pagos_abonos(monto, estado, notas)")
        .in("estado", ["pendiente", "parcial"])
        .order("fecha_emision", { ascending: false })
        .limit(5);

      // Cuentas vencidas (+30 días)
      const { data: vencidas } = await supabase
        .from("cuentas_por_cobrar")
        .select("id, valor_total, fecha_emision, asistentes(nombre), pagos_abonos(monto, estado, notas)")
        .lt("fecha_emision", thirtyStr)
        .in("estado", ["pendiente", "parcial"])
        .order("fecha_emision", { ascending: true })
        .limit(5);

      const buildAlert = (item: CuentaParaAviso, label: string, icon: AlertItem["icon"]): AlertItem => {
        const pagosValidos = filtrarPagosValidosCuentas(item.pagos_abonos || []);
        const abonado = pagosValidos.reduce((sum: number, p) => sum + Number(p.monto), 0);
        const pendiente = Math.max(0, Number(item.valor_total) - abonado);
        return {
          title: label,
          description: `${item.asistentes?.nombre || "Asistente"} • Pendiente ${pesos(pendiente)}`,
          href: `/cuentas/${item.id}`,
          icon,
        };
      };

      const alertsList: AlertItem[] = [];
      pendientes?.forEach((c) => alertsList.push(buildAlert(c, "Cuenta pendiente", "alert")));
      vencidas?.forEach((c) => alertsList.push(buildAlert(c, "Cuenta vencida (+30 días)", "clock")));

      setAlerts(alertsList);
      setLoadingAlerts(false);
    };

    if (alertsOpen && alerts.length === 0 && canSeeOperationalAlerts) {
      loadAlerts();
    }
  }, [alertsOpen, alerts.length, canSeeOperationalAlerts, supabase]);

  // Cierra el panel de avisos al tocar fuera o con Escape.
  useEffect(() => {
    if (!alertsOpen) return;
    const fuera = (e: MouseEvent) => {
      if (avisosRef.current && !avisosRef.current.contains(e.target as Node)) setAlertsOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setAlertsOpen(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [alertsOpen]);

  const icono = enInicio
    ? "text-sobre-campo-suave hover:bg-white/10 hover:text-sobre-campo"
    : "text-gris hover:bg-suave hover:text-tinta";

  return (
    <header
      className={cn(
        "sticky top-0 z-30 shrink-0",
        enInicio ? "bg-campo text-sobre-campo" : "border-b border-linea bg-panel"
      )}
      style={{ paddingTop: "var(--safe-top)" }}
    >
      <div className="flex h-14 items-center gap-2 px-3 md:h-16 md:px-8">
        {/* Celular: menú completo y marca */}
        <button
          type="button"
          onClick={abrirMenuCelular}
          aria-label="Abrir menú"
          className={cn("grid h-10 w-10 place-items-center rounded-xl md:hidden", icono)}
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/" className="flex min-w-0 items-center gap-2 md:hidden" aria-label="Inicio">
          <Image src="/logo-gemb-simbolo.png" alt="" width={48} height={28} className="h-7 w-auto" priority />
          <span className="truncate text-base font-semibold">Mentes Brillantes</span>
        </Link>

        {/* Computador: buscador del encabezado (en el Inicio está en grande, más abajo) */}
        {canUseGlobalSearch && !enInicio && (
          <div className="hidden w-full max-w-md md:block">
            <BuscadorGlobal userRole={userRole} />
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          {canUseGlobalSearch && !enInicio && (
            <button
              type="button"
              onClick={() => setBuscarEnCelular((v) => !v)}
              aria-label={buscarEnCelular ? "Cerrar búsqueda" : "Buscar"}
              aria-expanded={buscarEnCelular}
              className={cn("grid h-10 w-10 place-items-center rounded-xl md:hidden", icono)}
            >
              {buscarEnCelular ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
            </button>
          )}

          {canSeeOperationalAlerts && (
            <div ref={avisosRef} className="relative">
              <button
                type="button"
                onClick={() => setAlertsOpen((v) => !v)}
                className={cn("relative grid h-10 w-10 place-items-center rounded-xl transition-colors", icono)}
                aria-label="Avisos de cuentas pendientes"
                aria-expanded={alertsOpen}
                aria-haspopup="true"
              >
                <Bell className="h-5 w-5" />
                <span className={cn("absolute right-2 top-2 h-2 w-2 rounded-full bg-rojo ring-2", enInicio ? "ring-campo" : "ring-panel")} />
              </button>
              {alertsOpen && (
                <div className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-2xl border border-linea bg-panel text-tinta shadow-strong sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
                  <div className="flex items-center justify-between border-b border-linea px-4 py-3">
                    <span className="text-sm font-semibold text-tinta">Avisos</span>
                    <Link href="/cuentas?estado=pendiente" className="text-sm font-semibold text-acento underline-offset-4 hover:underline">Ver cuentas</Link>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {loadingAlerts && (
                      <div className="p-4 text-sm text-gris">Cargando avisos…</div>
                    )}
                    {!loadingAlerts && alerts.length === 0 && (
                      <div className="p-4 text-sm text-gris">Sin cuentas pendientes por avisar.</div>
                    )}
                    {!loadingAlerts && alerts.length > 0 && (
                      <ul className="divide-y divide-linea">
                        {alerts.map((alert, idx) => (
                          <li key={`${alert.href}-${idx}`}>
                            <Link href={alert.href} className="flex items-start gap-3 p-4 transition-colors hover:bg-suave">
                              <div className="mt-0.5">
                                {alert.icon === "clock" ? (
                                  <Clock className="h-4 w-4 text-ambar" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 text-rojo" />
                                )}
                              </div>
                              <div className="space-y-1">
                                <p className="text-sm font-semibold text-tinta">{alert.title}</p>
                                {alert.description && <p className="text-sm text-gris">{alert.description}</p>}
                              </div>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className={enInicio ? "[&>div>button]:text-sobre-campo-suave [&>div>button:hover]:bg-white/10 [&>div>button:hover]:text-sobre-campo" : undefined}>
            <BotonApariencia />
          </div>

          <div className="ml-2 hidden items-center gap-3 md:flex" title={userEmail || undefined}>
            <div className="flex min-w-0 flex-col items-end leading-tight">
              <span className="max-w-[16rem] truncate text-sm font-medium">{userEmail}</span>
              <span className={cn("text-xs", enInicio ? "text-sobre-campo-suave" : "text-gris")}>
                {userRole === "admin" ? "Administrador" : userRole === "caja" ? "Caja" : "Consulta"}
              </span>
            </div>
            <div
              aria-hidden
              className={cn(
                "grid h-9 w-9 place-items-center rounded-full text-sm font-bold",
                enInicio ? "bg-oro text-campo" : "bg-acento/12 text-acento"
              )}
            >
              {initial}
            </div>
          </div>
        </div>
      </div>

      {buscarEnCelular && canUseGlobalSearch && !enInicio && (
        <div className="px-3 pb-3 md:hidden">
          <BuscadorGlobal userRole={userRole} autoFocus />
        </div>
      )}
    </header>
  );
}
