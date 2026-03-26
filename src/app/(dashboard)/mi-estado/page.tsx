import { redirect } from "next/navigation";
import { requireRoles } from "@/lib/utils/authz";
import { filtrarPagosValidos, sumarMontos } from "@/lib/utils/contable";

export default async function MiEstadoPage() {
  const { supabase, perfil } = await requireRoles(['consulta']);

  const asistenteId = perfil.asistente_id;
  if (!asistenteId) redirect('/');

  const { data: asistente } = await supabase
    .from('asistentes')
    .select('id, nombre')
    .eq('id', asistenteId)
    .single();

  const { data: cuentas } = await supabase
    .from('cuentas_por_cobrar')
    .select(`
      id,
      concepto,
      valor_total,
      estado,
      pagos_abonos ( monto, notas )
    `)
    .eq('asistente_id', asistenteId)
    .order('fecha_emision', { ascending: false });

  const resumen = (cuentas ?? []).reduce(
    (acc, cuenta: any) => {
      const pagosValidos = filtrarPagosValidos(cuenta.pagos_abonos ?? []);
      const abonado = sumarMontos(pagosValidos);
      acc.totalAbonado += abonado;
      acc.totalPendiente += Math.max(0, Number(cuenta.valor_total) - abonado);
      return acc;
    },
    { totalAbonado: 0, totalPendiente: 0 }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[rgb(var(--text-primary))]">Mi estado</h1>
        <p className="text-[rgb(var(--text-muted))]">Resumen personal de cuentas y pagos.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] p-4 shadow-soft">
          <p className="text-sm text-[rgb(var(--text-muted))]">Asistente</p>
          <p className="text-lg font-semibold text-[rgb(var(--text-primary))]">{asistente?.nombre}</p>
        </div>
        <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] p-4 shadow-soft">
          <p className="text-sm text-[rgb(var(--text-muted))]">Total abonado</p>
          <p className="text-lg font-semibold text-[rgb(var(--text-primary))]">${resumen.totalAbonado.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] p-4 shadow-soft">
          <p className="text-sm text-[rgb(var(--text-muted))]">Saldo pendiente</p>
          <p className="text-lg font-semibold text-[rgb(var(--text-primary))]">${resumen.totalPendiente.toLocaleString()}</p>
        </div>
      </div>

      <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] p-4 shadow-soft">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))]">Cuentas por cobrar</h2>
          <span className="text-sm text-[rgb(var(--text-muted))]">{(cuentas ?? []).length} registros</span>
        </div>
        <div className="divide-y divide-[rgb(var(--border))]">
          {(cuentas ?? []).map((cuenta: any) => {
            const pagosValidos = filtrarPagosValidos(cuenta.pagos_abonos ?? []);
            const abonado = sumarMontos(pagosValidos);
            const pendiente = Math.max(0, Number(cuenta.valor_total) - abonado);
            return (
              <div key={cuenta.id} className="py-3">
                <div className="flex justify-between text-[rgb(var(--text-primary))]">
                  <div>
                    <p className="font-medium">{cuenta.concepto}</p>
                    <p className="text-sm text-[rgb(var(--text-muted))] capitalize">{cuenta.estado}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-[rgb(var(--text-muted))]">Valor: ${Number(cuenta.valor_total).toLocaleString()}</p>
                    <p className="text-sm text-[rgb(var(--text-muted))]">Abonado: ${abonado.toLocaleString()}</p>
                    <p className="text-sm font-semibold text-[rgb(var(--text-primary))]">Pendiente: ${pendiente.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
