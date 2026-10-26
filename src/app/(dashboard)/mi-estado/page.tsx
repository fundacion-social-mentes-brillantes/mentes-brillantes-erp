import { redirect } from "next/navigation";
import { requireRoles } from "@/lib/utils/authz";
import { filtrarPagosValidos, sumarMontos } from "@/lib/utils/contable";
import { pesos } from "@/lib/utils/pesos"

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
      pagos_abonos ( monto, estado, notas )
    `)
    .eq('asistente_id', asistenteId)
    .order('fecha_emision', { ascending: false });

  const resumen = (cuentas ?? []).reduce(
    (acc, cuenta) => {
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
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Mi estado</h1>
        <p className="text-gris">Resumen personal de cuentas y pagos.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        <div className="rounded-lg border border-linea bg-panel p-4 shadow-soft">
          <p className="text-sm text-gris">Asistente</p>
          <p className="text-lg font-semibold text-tinta">{asistente?.nombre}</p>
        </div>
        <div className="rounded-lg border border-linea bg-panel p-4 shadow-soft">
          <p className="text-sm text-gris">Total abonado</p>
          <p className="text-lg font-semibold text-tinta">{pesos(resumen.totalAbonado)}</p>
        </div>
        <div className="rounded-lg border border-linea bg-panel p-4 shadow-soft">
          <p className="text-sm text-gris">Saldo pendiente</p>
          <p className="text-lg font-semibold text-tinta">{pesos(resumen.totalPendiente)}</p>
        </div>
      </div>

      <div className="rounded-lg border border-linea bg-panel p-4 shadow-soft">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-tinta">Cuentas por cobrar</h2>
          <span className="text-sm text-gris">{(cuentas ?? []).length} registros</span>
        </div>
        <div className="divide-y divide-linea">
          {(cuentas ?? []).map((cuenta) => {
            const pagosValidos = filtrarPagosValidos(cuenta.pagos_abonos ?? []);
            const abonado = sumarMontos(pagosValidos);
            const pendiente = Math.max(0, Number(cuenta.valor_total) - abonado);
            return (
              <div key={cuenta.id} className="py-3">
                <div className="flex justify-between text-tinta">
                  <div>
                    <p className="font-medium">{cuenta.concepto}</p>
                    <p className="text-sm text-gris capitalize">{cuenta.estado}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gris">Valor: {pesos(Number(cuenta.valor_total))}</p>
                    <p className="text-sm text-gris">Abonado: {pesos(abonado)}</p>
                    <p className="text-sm font-semibold text-tinta">Pendiente: {pesos(pendiente)}</p>
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
