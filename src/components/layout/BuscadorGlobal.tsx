'use client'

import { useEffect, useMemo, useRef, useState } from "react";
import { textoParaFiltro } from '@/lib/supabase/filtros'
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Users, Receipt, History, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { pesos } from '@/lib/utils/pesos'
import { cn } from "@/lib/utils";

type ResultadosBusqueda = {
  asistentes: Array<{ id: string; nombre: string; codigo: string | null; cedula?: string | null }>;
  cuentas: Array<{ id: string; concepto: string; valor_total: number; estado: string; asistentes: { nombre: string } | null }>;
  movimientos: Array<{
    id: string;
    monto: number;
    metodo_pago: string | null;
    fecha_pago: string;
    notas: string | null;
    cuentas_por_cobrar: { id: string; concepto: string } | null;
  }>;
};

/**
 * Búsqueda global en vivo (personas, cuentas y abonos) con su desplegable de resultados.
 * "barra" es la del encabezado; "grande" es la del Inicio («¿A quién vas a atender?»).
 */
export function BuscadorGlobal({
  userRole,
  variante = "barra",
  autoFocus = false,
}: {
  userRole: string
  variante?: "barra" | "grande"
  autoFocus?: boolean
}) {
  const router = useRouter();
  const canUseGlobalSearch = userRole === "admin" || userRole === "caja";
  const [query, setQuery] = useState("");

  // Búsqueda global en vivo (desplegable de resultados mientras se escribe)
  const [results, setResults] = useState<ResultadosBusqueda>({
    asistentes: [],
    cuentas: [],
    movimientos: [],
  });
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const supabase = useMemo(() => createClient(), []);

  // Búsqueda en vivo: consulta mientras se escribe (con un pequeño retardo)
  useEffect(() => {
    if (!canUseGlobalSearch || !supabase) return;
    const term = query.trim();
    if (term.length < 2) {
      // Busqueda en vivo con retardo: limpiar al borrar es parte de la sincronizacion con la base.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults({ asistentes: [], cuentas: [], movimientos: [] });
      setSearching(false);
      return;
    }

    setSearching(true);
    // Si el texto cambia mientras esta busqueda viaja, su respuesta ya no se pinta
    // (antes una busqueda vieja y lenta podia pisar los resultados de la nueva).
    let vigente = true;
    const handle = setTimeout(async () => {
      const like = `%${textoParaFiltro(term)}%`;
      const isAdmin = userRole === "admin";
      const aFilter = isAdmin
        ? `nombre.ilike.${like},codigo.ilike.${like},cedula.ilike.${like}`
        : `nombre.ilike.${like},codigo.ilike.${like}`;

      const [aRes, cRes, mRes] = await Promise.all([
        // La cedula solo la ve el admin: para caja ni se pide.
        isAdmin
          ? supabase.from("asistentes").select("id, nombre, codigo, cedula").or(aFilter).limit(6)
          : supabase.from("asistentes").select("id, nombre, codigo").or(aFilter).limit(6),
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
      if (!vigente) return;

      setResults({
        asistentes: aRes.data || [],
        cuentas: cRes.data || [],
        movimientos: mRes.data || [],
      });
      setSearching(false);
      setSearchOpen(true);
    }, 250);

    return () => {
      vigente = false;
      clearTimeout(handle);
    };
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

  if (!canUseGlobalSearch) return null;

  const totalResults =
    results.asistentes.length + results.cuentas.length + results.movimientos.length;

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };

  const onSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearchOpen(false);
    router.push(`/buscar?q=${encodeURIComponent(query.trim())}`);
  };

  const grande = variante === "grande";
  const tituloGrupo = "flex items-center gap-1.5 px-4 pb-1 pt-3 text-xs font-semibold text-gris";
  const filaResultado = "flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-suave";

  return (
    <div ref={searchRef} className="relative w-full">
      <form onSubmit={onSearch} role="search" className="relative">
        <Search
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2",
            grande ? "left-4 h-5 w-5 text-acento" : "left-3 h-4 w-4 text-gris"
          )}
        />
        <input
          type="search"
          autoFocus={autoFocus}
          enterKeyHint="search"
          aria-label="Buscar asistentes, cuentas o movimientos"
          placeholder={grande ? "Nombre, código o cédula de la persona" : "Buscar persona, cuenta o abono"}
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            setSearchOpen(v.trim().length >= 2);
          }}
          onFocus={() => {
            if (query.trim().length >= 2) setSearchOpen(true);
          }}
          className={cn(
            "w-full appearance-none border text-tinta outline-none transition-colors [&::-webkit-search-cancel-button]:hidden",
            grande
              ? "h-14 rounded-2xl border-transparent bg-panel pl-12 pr-11 text-base shadow-soft focus-visible:outline-offset-4 focus-visible:outline-sobre-campo"
              : "h-10 rounded-xl border-linea bg-suave pl-9 pr-9 text-sm hover:border-linea-fuerte focus:border-acento focus:bg-panel"
          )}
        />
        {query && (
          <button
            type="button"
            onClick={closeSearch}
            aria-label="Limpiar búsqueda"
            className={cn(
              "absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-lg text-gris hover:text-tinta",
              grande ? "right-3 h-8 w-8" : "right-2 h-7 w-7"
            )}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>

      {searchOpen && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-linea bg-panel text-tinta shadow-strong">
          <div className="max-h-[70vh] overflow-y-auto">
            {searching && totalResults === 0 && (
              <div className="flex items-center gap-2 px-4 py-4 text-sm text-gris">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
              </div>
            )}

            {!searching && totalResults === 0 && query.trim().length >= 2 && (
              <div className="px-4 py-4 text-sm text-gris">
                Sin resultados para “{query.trim()}”.
              </div>
            )}

            {results.asistentes.length > 0 && (
              <div>
                <p className={tituloGrupo}>
                  <Users className="h-3.5 w-3.5" /> Asistentes
                </p>
                {results.asistentes.map((a) => (
                  <Link key={a.id} href={`/asistentes/${a.id}`} onClick={closeSearch} className={filaResultado}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-tinta">{a.nombre}</span>
                      <span className="block truncate text-xs text-gris">
                        {a.codigo ? `Cod: ${a.codigo}` : ""}
                        {userRole === "admin" && a.cedula ? `  ·  CC: ${a.cedula}` : ""}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}

            {results.cuentas.length > 0 && (
              <div className="border-t border-linea">
                <p className={tituloGrupo}>
                  <Receipt className="h-3.5 w-3.5" /> Cuentas
                </p>
                {results.cuentas.map((c) => (
                  <Link key={c.id} href={`/cuentas/${c.id}`} onClick={closeSearch} className={filaResultado}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-tinta">{c.concepto}</span>
                      <span className="block truncate text-xs text-gris">{c.asistentes?.nombre || "Asistente"} · {c.estado}</span>
                    </span>
                    <span className="cifra shrink-0 text-sm font-medium text-gris">{pesos(Number(c.valor_total))}</span>
                  </Link>
                ))}
              </div>
            )}

            {results.movimientos.length > 0 && (
              <div className="border-t border-linea">
                <p className={tituloGrupo}>
                  <History className="h-3.5 w-3.5" /> Movimientos
                </p>
                {results.movimientos.map((m) => {
                  const cuentaId = m.cuentas_por_cobrar?.id;
                  const inner = (
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-tinta">Abono {pesos(Number(m.monto))}</span>
                      <span className="block truncate text-xs text-gris">
                        {m.cuentas_por_cobrar?.concepto || "Cuenta"} · {m.metodo_pago}
                        {m.notas ? `  ·  ${m.notas}` : ""}
                      </span>
                    </span>
                  );
                  return cuentaId ? (
                    <Link key={m.id} href={`/cuentas/${cuentaId}`} onClick={closeSearch} className={filaResultado}>
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
                className="w-full border-t border-linea px-4 py-3 text-center text-sm font-semibold text-acento hover:bg-suave"
              >
                Ver todos los resultados
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
