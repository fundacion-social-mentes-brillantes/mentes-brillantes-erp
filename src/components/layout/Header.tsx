'use client'

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Search, AlertCircle, Clock, Users, Receipt, History, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme/ThemeProvider";
import { createClient } from "@/lib/supabase/client";
import { filtrarPagosValidosCuentas } from "@/lib/utils/contable";

type AlertItem = {
  title: string;
  description?: string;
  href: string;
  icon?: "alert" | "clock";
};

export function Header({ userEmail, userRole = 'user' }: { userEmail?: string, userRole?: string }) {
  const initial = userEmail ? userEmail.charAt(0).toUpperCase() : 'U';
  const router = useRouter();
  const canUseGlobalSearch = userRole === "admin" || userRole === "caja";
  const canSeeOperationalAlerts = userRole === "admin" || userRole === "caja";
  const [query, setQuery] = useState("");
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  // Búsqueda global en vivo (desplegable de resultados mientras se escribe)
  const [results, setResults] = useState<{ asistentes: any[]; cuentas: any[]; movimientos: any[] }>({
    asistentes: [],
    cuentas: [],
    movimientos: [],
  });
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

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

      const buildAlert = (item: any, label: string, icon: AlertItem["icon"]): AlertItem => {
        const pagosValidos = filtrarPagosValidosCuentas(item.pagos_abonos || []);
        const abonado = pagosValidos.reduce((sum: number, p: any) => sum + Number(p.monto), 0);
        const pendiente = Math.max(0, Number(item.valor_total) - abonado);
        return {
          title: label,
          description: `${item.asistentes?.nombre || "Asistente"} • Pendiente $${pendiente.toLocaleString()}`,
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

  // Búsqueda en vivo: consulta mientras se escribe (con un pequeño retardo)
  useEffect(() => {
    if (!canUseGlobalSearch || !supabase) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults({ asistentes: [], cuentas: [], movimientos: [] });
      setSearching(false);
      return;
    }

    setSearching(true);
    const handle = setTimeout(async () => {
      const like = `%${term}%`;
      const isAdmin = userRole === "admin";
      const aFields = isAdmin ? "id, nombre, codigo, cedula" : "id, nombre, codigo";
      const aFilter = isAdmin
        ? `nombre.ilike.${like},codigo.ilike.${like},cedula.ilike.${like}`
        : `nombre.ilike.${like},codigo.ilike.${like}`;

      const [aRes, cRes, mRes] = await Promise.all([
        supabase.from("asistentes").select(aFields).or(aFilter).limit(6),
        supabase
          .from("cuentas_por_cobrar")
          .select("id, concepto, valor_total, estado, asistentes(nombre)")
          .or(`concepto.ilike.${like}`)
          .limit(6),
        supabase
          .from("pagos_abonos")
          .select("id, monto, metodo_pago, fecha_pago, notas, cuentas_por_cobrar(id, concepto)")
          .or(`notas.ilike.${like}`)
          .limit(6),
      ]);

      setResults({
        asistentes: aRes.data || [],
        cuentas: cRes.data || [],
        movimientos: mRes.data || [],
      });
      setSearching(false);
      setSearchOpen(true);
    }, 250);

    return () => clearTimeout(handle);
  }, [query, canUseGlobalSearch, supabase, userRole]);

  // Cierra el desplegable al hacer clic fuera o presionar Escape
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const totalResults =
    results.asistentes.length + results.cuentas.length + results.movimientos.length;

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };

  const onSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canUseGlobalSearch) return;
    if (!query.trim()) return;
    setSearchOpen(false);
    router.push(`/buscar?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <header className="border-b border-[rgba(var(--border),0.62)] bg-[rgba(var(--surface-1),0.82)] px-4 sm:px-6 py-3 sm:py-0 pl-14 sm:pl-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 sm:h-16 sticky top-0 z-10 shadow-soft transition-colors backdrop-blur-xl">
      <div className="flex items-center gap-3 sm:gap-4 flex-1 w-full">
        {canUseGlobalSearch && (
          <div ref={searchRef} className="relative w-full max-w-full sm:max-w-md">
            <form onSubmit={onSearch} className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[rgb(var(--warning))] pointer-events-none" />
              <Input
                type="text"
                placeholder="Buscar asistentes, cuentas o movimientos..."
                value={query}
                onChange={(e) => {
                  const v = e.target.value;
                  setQuery(v);
                  setSearchOpen(v.trim().length >= 2);
                }}
                onFocus={() => {
                  if (query.trim().length >= 2) setSearchOpen(true);
                }}
                className="pl-10 pr-9 rounded-full bg-[rgba(var(--surface-2),0.72)] border-[rgba(var(--border),0.68)] focus-visible:ring-[rgb(var(--ring-color))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--surface-1))] shadow-[inset_0_1px_0_rgba(var(--glass-highlight),0.08)]"
              />
              {query && (
                <button
                  type="button"
                  onClick={closeSearch}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-3 top-2.5 text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-primary))]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </form>

            {searchOpen && (
              <div
                className="absolute left-0 right-0 top-full mt-2 z-30 rounded-2xl border border-[rgb(var(--border))] shadow-strong overflow-hidden"
                style={{ backgroundColor: "rgb(var(--surface-1))" }}
              >
                <div className="max-h-[70vh] overflow-y-auto">
                  {searching && totalResults === 0 && (
                    <div className="flex items-center gap-2 px-4 py-4 text-sm text-[rgb(var(--text-muted))]">
                      <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
                    </div>
                  )}

                  {!searching && totalResults === 0 && query.trim().length >= 2 && (
                    <div className="px-4 py-4 text-sm text-[rgb(var(--text-muted))]">
                      Sin resultados para “{query.trim()}”.
                    </div>
                  )}

                  {results.asistentes.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--text-muted))] flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" /> Asistentes
                      </p>
                      {results.asistentes.map((a: any) => (
                        <Link
                          key={a.id}
                          href={`/asistentes/${a.id}`}
                          onClick={closeSearch}
                          className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-[rgba(var(--surface-2),0.8)] transition-colors"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-[rgb(var(--text-primary))] truncate">{a.nombre}</span>
                            <span className="block text-xs text-[rgb(var(--text-muted))] truncate">
                              {a.codigo ? `Cod: ${a.codigo}` : ""}
                              {userRole === "admin" && a.cedula ? `  ·  CC: ${a.cedula}` : ""}
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}

                  {results.cuentas.length > 0 && (
                    <div className="border-t border-[rgba(var(--border),0.5)]">
                      <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--text-muted))] flex items-center gap-1.5">
                        <Receipt className="h-3.5 w-3.5" /> Cuentas
                      </p>
                      {results.cuentas.map((c: any) => (
                        <Link
                          key={c.id}
                          href={`/cuentas/${c.id}`}
                          onClick={closeSearch}
                          className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-[rgba(var(--surface-2),0.8)] transition-colors"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-[rgb(var(--text-primary))] truncate">{c.concepto}</span>
                            <span className="block text-xs text-[rgb(var(--text-muted))] truncate">{c.asistentes?.nombre || "Asistente"} · {c.estado}</span>
                          </span>
                          <span className="shrink-0 text-xs font-medium text-[rgb(var(--text-muted))]">${Number(c.valor_total).toLocaleString()}</span>
                        </Link>
                      ))}
                    </div>
                  )}

                  {results.movimientos.length > 0 && (
                    <div className="border-t border-[rgba(var(--border),0.5)]">
                      <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--text-muted))] flex items-center gap-1.5">
                        <History className="h-3.5 w-3.5" /> Movimientos
                      </p>
                      {results.movimientos.map((m: any) => {
                        const cuentaId = m.cuentas_por_cobrar?.id;
                        const inner = (
                          <>
                            <span className="block text-sm font-medium text-[rgb(var(--text-primary))] truncate">Abono ${Number(m.monto).toLocaleString()}</span>
                            <span className="block text-xs text-[rgb(var(--text-muted))] truncate">
                              {m.cuentas_por_cobrar?.concepto || "Cuenta"} · {m.metodo_pago}
                              {m.notas ? `  ·  ${m.notas}` : ""}
                            </span>
                          </>
                        );
                        return cuentaId ? (
                          <Link
                            key={m.id}
                            href={`/cuentas/${cuentaId}`}
                            onClick={closeSearch}
                            className="block px-4 py-2.5 hover:bg-[rgba(var(--surface-2),0.8)] transition-colors"
                          >
                            {inner}
                          </Link>
                        ) : (
                          <div key={m.id} className="px-4 py-2.5">{inner}</div>
                        );
                      })}
                    </div>
                  )}

                  {totalResults > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const q = query.trim();
                        setSearchOpen(false);
                        router.push(`/buscar?q=${encodeURIComponent(q)}`);
                      }}
                      className="w-full text-center px-4 py-3 text-sm font-medium text-[rgb(var(--info))] hover:bg-[rgba(var(--surface-2),0.8)] border-t border-[rgba(var(--border),0.5)]"
                    >
                      Ver todos los resultados
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end flex-wrap sm:flex-nowrap">
        <ThemeToggle />
        {canSeeOperationalAlerts && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setAlertsOpen((v) => !v)}
              className="relative p-2 text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-primary))] hover:bg-[rgba(var(--surface-2),0.82)] rounded-full transition-colors border border-[rgba(var(--border),0.48)] shadow-soft"
              aria-expanded={alertsOpen}
              aria-haspopup="true"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[rgb(var(--danger))] rounded-full border-2 border-[rgb(var(--surface-1))] shadow-[0_0_0_3px_rgba(var(--danger),0.12)]"></span>
            </button>
            {alertsOpen && (
              <div
                className="absolute right-0 mt-2 w-80 rounded-2xl border border-[rgb(var(--border))] shadow-strong z-20 overflow-hidden"
                style={{ backgroundColor: "rgb(var(--surface-1))" }}
              >
                <div className="px-4 py-3 border-b border-[rgba(var(--border),0.58)] flex items-center justify-between bg-[rgba(var(--surface-2),0.46)]">
                  <span className="text-sm font-semibold text-[rgb(var(--text-primary))]">Alertas operativas</span>
                  <Link href="/cuentas?estado=pendiente" className="text-xs text-[rgb(var(--info))] hover:underline">Ver cuentas</Link>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {loadingAlerts && (
                    <div className="p-4 text-sm text-[rgb(var(--text-muted))]">Cargando alertas...</div>
                  )}
                  {!loadingAlerts && alerts.length === 0 && (
                    <div className="p-4 text-sm text-[rgb(var(--text-muted))]">Sin alertas pendientes.</div>
                  )}
                  {!loadingAlerts && alerts.length > 0 && (
                    <ul className="divide-y divide-[rgb(var(--border))]">
                      {alerts.map((alert, idx) => (
                        <li key={`${alert.href}-${idx}`} className="p-4 hover:bg-[rgba(var(--surface-2),0.72)] transition-colors">
                          <Link href={alert.href} className="flex items-start gap-3">
                            <div className="mt-0.5">
                              {alert.icon === "clock" ? (
                                <Clock className="w-4 h-4 text-[rgb(var(--warning))]" />
                              ) : (
                                <AlertCircle className="w-4 h-4 text-[rgb(var(--danger))]" />
                              )}
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-[rgb(var(--text-primary))]">{alert.title}</p>
                              {alert.description && <p className="text-xs text-[rgb(var(--text-muted))]">{alert.description}</p>}
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
        <div className="flex items-center gap-3 border-l border-[rgba(var(--border),0.58)] pl-4 ml-2">
          <div className="flex flex-col items-end min-w-0">
            <span className="text-sm font-medium text-[rgb(var(--text-primary))] truncate max-w-[42vw] sm:max-w-[16rem]">{userEmail}</span>
            {userRole === 'admin' ? (
              <span className="text-[10px] sm:text-xs font-semibold premium-badge px-2 py-0.5 rounded-full mt-0.5">
                Administrador
              </span>
            ) : (
              <span className="text-[10px] sm:text-xs font-medium bg-[rgba(var(--muted-surface),0.6)] text-[rgb(var(--text-muted))] border border-[rgba(var(--border),0.6)] px-2 py-0.5 rounded-full mt-0.5">
                Usuario
              </span>
            )}
          </div>
          <div className="h-9 w-9 rounded-full bg-[linear-gradient(135deg,rgb(var(--gold)),rgb(var(--accent)))] text-[rgb(var(--accent-foreground))] flex items-center justify-center text-sm font-bold shadow-soft border border-[rgba(var(--gold),0.38)]">
            {initial}
          </div>
        </div>
      </div>
    </header>
  );
}
