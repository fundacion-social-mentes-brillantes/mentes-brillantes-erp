import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchResult = {
  asistentes: any[];
  cuentas: any[];
  movimientos: any[];
};

async function runSearch(q: string): Promise<SearchResult> {
  const supabase = await createClient();
  if (!supabase) return { asistentes: [], cuentas: [], movimientos: [] };

  const term = `%${q}%`;

  const [{ data: asistentes }, { data: cuentas }, { data: movimientos }] = await Promise.all([
    supabase
      .from("asistentes")
      .select("id, nombre, codigo, cedula")
      .or(`nombre.ilike.${term},codigo.ilike.${term},cedula.ilike.${term}`)
      .limit(10),
    supabase
      .from("cuentas_por_cobrar")
      .select("id, concepto, valor_total, estado, asistentes(nombre)")
      .or(`concepto.ilike.${term}`)
      .limit(10),
    supabase
      .from("pagos_abonos")
      .select("id, monto, metodo_pago, fecha_pago, notas, cuentas_por_cobrar(concepto)")
      .or(`notas.ilike.${term}`)
      .limit(10),
  ]);

  return {
    asistentes: asistentes || [],
    cuentas: cuentas || [],
    movimientos: movimientos || [],
  };
}

export default async function BuscarPage({ searchParams }: { searchParams?: { q?: string } }) {
  const q = searchParams?.q?.trim();
  if (!q) {
    return (
      <div className="max-w-5xl mx-auto py-10 space-y-4">
        <h1 className="text-2xl font-bold text-[rgb(var(--text-primary))]">Búsqueda global</h1>
        <p className="text-[rgb(var(--text-muted))]">Escribe un término en el buscador superior para ver resultados.</p>
      </div>
    );
  }

  const results = await runSearch(q);
  const hasResults = results.asistentes.length || results.cuentas.length || results.movimientos.length;

  if (!hasResults) {
    return (
      <div className="max-w-5xl mx-auto py-10 space-y-4">
        <h1 className="text-2xl font-bold text-[rgb(var(--text-primary))]">Búsqueda global</h1>
        <p className="text-[rgb(var(--text-muted))]">Sin resultados para “{q}”.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--text-primary))]">Resultados para “{q}”</h1>
        <p className="text-[rgb(var(--text-muted))]">Asistentes, cuentas y movimientos relevantes.</p>
      </div>

      {results.asistentes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))]">Asistentes</h2>
          <div className="divide-y divide-[rgb(var(--border))] rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] overflow-hidden">
            {results.asistentes.map((a) => (
              <Link key={a.id} href={`/asistentes/${a.id}`} className="block px-4 py-3 hover:bg-[rgb(var(--surface-2))] transition-colors">
                <p className="font-medium text-[rgb(var(--text-primary))]">{a.nombre}</p>
                <p className="text-xs text-[rgb(var(--text-muted))] flex gap-2">
                  {a.codigo && <span>Cod: {a.codigo}</span>}
                  {a.cedula && <span>CC: {a.cedula}</span>}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {results.cuentas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))]">Cuentas por cobrar</h2>
          <div className="divide-y divide-[rgb(var(--border))] rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] overflow-hidden">
            {results.cuentas.map((c: any) => (
              <Link key={c.id} href={`/cuentas/${c.id}`} className="block px-4 py-3 hover:bg-[rgb(var(--surface-2))] transition-colors">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-[rgb(var(--text-primary))]">{c.concepto}</p>
                  <span className="text-sm text-[rgb(var(--text-muted))]">${Number(c.valor_total).toLocaleString()}</span>
                </div>
                <p className="text-xs text-[rgb(var(--text-muted))]">
                  {c.asistentes?.nombre || "Asistente"} • {c.estado}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {results.movimientos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))]">Movimientos</h2>
          <div className="divide-y divide-[rgb(var(--border))] rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] overflow-hidden">
            {results.movimientos.map((m: any) => (
              <div key={m.id} className="px-4 py-3">
                <p className="font-medium text-[rgb(var(--text-primary))]">Abono ${Number(m.monto).toLocaleString()}</p>
                <p className="text-xs text-[rgb(var(--text-muted))]">
                  {m.cuentas_por_cobrar?.concepto || "Cuenta"} • {m.metodo_pago} • {m.fecha_pago}
                </p>
                {m.notas && <p className="text-xs text-[rgb(var(--text-muted))] mt-1">{m.notas}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
