import { ArrowUpRight, ArrowDownRight, Users, Wallet, AlertCircle, Receipt, History, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { MonthSelector } from "./MonthSelector";
import { BalanceChart } from "./BalanceChart";

export async function Dashboard({ month }: { month?: string }) {
  const supabase = await createClient();
  if (!supabase) return null;

  const now = new Date();
  
  // Parse selected month or use current month
  let targetYear = now.getFullYear();
  let targetMonth = now.getMonth();
  
  if (month) {
    const [yearStr, monthStr] = month.split('-');
    targetYear = parseInt(yearStr, 10);
    targetMonth = parseInt(monthStr, 10) - 1;
  }
  
  const currentMonthValue = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
  
  const firstDayOfMonth = new Date(targetYear, targetMonth, 1).toISOString().split('T')[0];
  const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).toISOString().split('T')[0];

  // 1. INDICADORES DEL PERÍODO SELECCIONADO
  
  // Ingresos del Mes
  const { data: rawIngresosData } = await supabase
    .from('pagos_abonos')
    .select('monto, fecha_pago, metodo_pago, origen_fondos')
    .gte('fecha_pago', firstDayOfMonth)
    .lte('fecha_pago', lastDayOfMonth);
    
  // Excluir ingresos que provienen de saldo a favor para no duplicar sumas
  const ingresosData = rawIngresosData?.filter(item => 
    item.metodo_pago !== 'Saldo_a_favor' && 
    item.metodo_pago !== 'saldo_a_favor' &&
    item.origen_fondos !== 'saldo_a_favor' &&
    (item as any).tipo !== 'aplicacion_saldo'
  ) || [];

  const ingresosMes = Math.round(ingresosData.reduce((acc, curr) => acc + Number(curr.monto), 0));

  // Egresos del Mes
  const { data: egresosData } = await supabase
    .from('egresos')
    .select('monto, fecha')
    .gte('fecha', firstDayOfMonth)
    .lte('fecha', lastDayOfMonth);
  const egresosMes = Math.round(egresosData?.reduce((acc, curr) => acc + Number(curr.monto), 0) || 0);
  
  // Utilidad del Mes
  const utilidadMes = Math.round(ingresosMes - egresosMes);

  // Preparar datos para la gráfica de balance acumulado
  const dailyData: Record<string, { ingresos: number, egresos: number }> = {};
  const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const isCurrentMonth = now.getFullYear() === targetYear && now.getMonth() === targetMonth;
  const lastDayToProcess = isCurrentMonth ? now.getDate() : daysInMonth;
  
  for (let i = 1; i <= lastDayToProcess; i++) {
    const dateStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    dailyData[dateStr] = { ingresos: 0, egresos: 0 };
  }

  ingresosData?.forEach(item => {
    const date = item.fecha_pago;
    if (dailyData[date]) {
      dailyData[date].ingresos += Number(item.monto);
    }
  });

  egresosData?.forEach(item => {
    const date = item.fecha;
    if (dailyData[date]) {
      dailyData[date].egresos += Number(item.monto);
    }
  });

  let acumulado = 0;
  const chartData = Object.keys(dailyData).sort().map(date => {
    const dayData = dailyData[date];
    acumulado += (dayData.ingresos - dayData.egresos);
    return {
      date: date.split('-')[2], // Just the day
      balance: acumulado
    };
  });

  // Facturado y Pendiente del Mes
  const { data: cuentasPeriodoData } = await supabase
    .from('cuentas_por_cobrar')
    .select('valor_total, pagos_abonos(monto)')
    .gte('fecha_emision', firstDayOfMonth)
    .lte('fecha_emision', lastDayOfMonth);
    
  const facturadoMes = Math.round(cuentasPeriodoData?.reduce((acc, curr) => acc + Number(curr.valor_total), 0) || 0);
  const pendienteMes = Math.round(cuentasPeriodoData?.reduce((acc, curr) => {
    const abonado = curr.pagos_abonos?.reduce((sum: number, pago: any) => sum + Number(pago.monto), 0) || 0;
    return acc + (Number(curr.valor_total) - abonado);
  }, 0) || 0);

  // 2. INDICADORES HISTÓRICOS APARTE
  
  // Cartera Total (Todas las cuentas pendientes)
  const { data: carteraTotalData } = await supabase
    .from('cuentas_por_cobrar')
    .select('valor_total, pagos_abonos(monto)')
    .in('estado', ['pendiente', 'parcial']);
    
  const carteraTotal = Math.round(carteraTotalData?.reduce((acc, curr) => {
    const abonado = curr.pagos_abonos?.reduce((sum: number, pago: any) => sum + Number(pago.monto), 0) || 0;
    return acc + (Number(curr.valor_total) - abonado);
  }, 0) || 0);
  
  // Cartera Antigua (+30 días)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
  
  const { data: carteraAntiguaData } = await supabase
    .from('cuentas_por_cobrar')
    .select('asistente_id, valor_total, pagos_abonos(monto)')
    .in('estado', ['pendiente', 'parcial'])
    .lt('fecha_emision', thirtyDaysAgoStr);
    
  let carteraAntigua = 0;
  const personasAntiguasSet = new Set<string>();
  
  carteraAntiguaData?.forEach(curr => {
    const abonado = curr.pagos_abonos?.reduce((sum: number, p: any) => sum + Number(p.monto), 0) || 0;
    const pendiente = Number(curr.valor_total) - abonado;
    if (pendiente > 0) {
      carteraAntigua += pendiente;
      if (curr.asistente_id) {
        personasAntiguasSet.add(curr.asistente_id);
      }
    }
  });
  
  carteraAntigua = Math.round(carteraAntigua);
  const personasConCarteraAntigua = personasAntiguasSet.size;

  // Cuentas Pendientes (Top 5 más recientes para la lista)
  const { data: cuentasPendientesData } = await supabase
    .from('cuentas_por_cobrar')
    .select(`
      id,
      concepto,
      fecha_emision,
      valor_total,
      asistentes ( nombre ),
      pagos_abonos ( monto )
    `)
    .in('estado', ['pendiente', 'parcial'])
    .order('fecha_emision', { ascending: false })
    .limit(5);

  const cuentasPendientes = cuentasPendientesData?.map((cuenta: any) => {
    const total_abonado = cuenta.pagos_abonos?.reduce((sum: number, pago: any) => sum + Number(pago.monto), 0) || 0;
    return {
      ...cuenta,
      monto_pendiente: Math.round(Number(cuenta.valor_total) - total_abonado)
    };
  }) || [];

  const periodStats = [
    {
      name: "Ingresos del Período",
      value: `$${ingresosMes.toLocaleString()}`,
      icon: ArrowUpRight,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      tooltip: "Suma de los pagos y abonos recibidos dentro del mes seleccionado."
    },
    {
      name: "Egresos del Período",
      value: `$${egresosMes.toLocaleString()}`,
      icon: ArrowDownRight,
      color: "text-red-600",
      bg: "bg-red-50",
      tooltip: "Suma de los gastos registrados dentro del mes seleccionado."
    },
    {
      name: "Utilidad del Período",
      value: `$${utilidadMes.toLocaleString()}`,
      icon: Wallet,
      color: utilidadMes >= 0 ? "text-emerald-600" : "text-red-600",
      bg: utilidadMes >= 0 ? "bg-emerald-50" : "bg-red-50",
      tooltip: "Ingresos del período menos egresos del período."
    },
    {
      name: "Facturado del Período",
      value: `$${facturadoMes.toLocaleString()}`,
      icon: Receipt,
      color: "text-blue-600",
      bg: "bg-blue-50",
      tooltip: "Valor total de las cuentas por cobrar creadas en ese mes, aunque no se hayan pagado todavía."
    },
    {
      name: "Pendiente del Período",
      value: `$${pendienteMes.toLocaleString()}`,
      icon: AlertCircle,
      color: "text-amber-600",
      bg: "bg-amber-50",
      tooltip: "Saldo que aún falta por cobrar, pero solo de las cuentas creadas en ese mes."
    },
  ];
  
  const historicalStats = [
    {
      name: "Cartera Total",
      value: `$${carteraTotal.toLocaleString()}`,
      icon: Wallet,
      color: "text-zinc-700",
      bg: "bg-zinc-100",
      tooltip: "Toda la deuda pendiente del sistema, sin importar el mes."
    },
    {
      name: "Cartera Antigua (+30 días)",
      value: `$${carteraAntigua.toLocaleString()}`,
      icon: History,
      color: "text-red-600",
      bg: "bg-red-50",
      tooltip: "Deuda pendiente de cuentas con más de 30 días desde su fecha de emisión."
    },
    {
      name: "Personas con Deuda Antigua",
      value: personasConCarteraAntigua.toString(),
      icon: Users,
      color: "text-orange-600",
      bg: "bg-orange-50",
      tooltip: "Cantidad de asistentes que tienen al menos una cuenta antigua pendiente."
    },
  ];

  const displayMonthName = new Date(targetYear, targetMonth, 1).toLocaleString('es', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Dashboard</h1>
          <p className="text-zinc-500 text-sm">Resumen financiero y estado de cartera.</p>
        </div>
        <MonthSelector currentMonth={currentMonthValue} />
      </div>

      {/* 1. INDICADORES DEL PERÍODO */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900 border-b border-zinc-200 pb-2">
          Indicadores del Período <span className="text-zinc-500 font-normal text-sm ml-2 capitalize">({displayMonthName})</span>
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {periodStats.map((stat) => (
            <div
              key={stat.name}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-zinc-500">{stat.name}</p>
                  <div className="group relative flex items-center">
                    <Info className="w-3.5 h-3.5 text-zinc-400 cursor-help outline-none" tabIndex={0} />
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 bg-zinc-900 text-white text-xs rounded-md p-2 shadow-lg z-10 text-center">
                      {stat.tooltip}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900"></div>
                    </div>
                  </div>
                </div>
                <div className={`p-1.5 rounded-lg ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-xl font-semibold text-zinc-900">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. INDICADORES HISTÓRICOS */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900 border-b border-zinc-200 pb-2">
          Indicadores Históricos <span className="text-zinc-500 font-normal text-sm ml-2">(Acumulado General)</span>
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {historicalStats.map((stat) => (
            <div
              key={stat.name}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-zinc-500">{stat.name}</p>
                  <div className="group relative flex items-center">
                    <Info className="w-4 h-4 text-zinc-400 cursor-help outline-none" tabIndex={0} />
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 bg-zinc-900 text-white text-xs rounded-md p-2 shadow-lg z-10 text-center">
                      {stat.tooltip}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900"></div>
                    </div>
                  </div>
                </div>
                <div className={`p-2 rounded-lg ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-2xl font-semibold text-zinc-900">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm flex flex-col">
          <h3 className="text-base font-semibold text-zinc-900 mb-4">Balance del Período</h3>
          <BalanceChart data={chartData} utilidadMes={utilidadMes} displayMonthName={displayMonthName} />
        </div>
        
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-zinc-900">Cuentas Recientes Pendientes</h3>
            <Link href="/cuentas?estado=pendiente" className="text-xs font-medium text-blue-600 hover:text-blue-800">Ver todas</Link>
          </div>
          <div className="space-y-4 flex-1 overflow-y-auto">
            {cuentasPendientes?.map((cuenta: any) => {
              const saldo = cuenta.monto_pendiente || 0;
              const isOverdue = new Date(cuenta.fecha_emision) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Más de 30 días
              return (
                <Link key={cuenta.id} href={`/cuentas/${cuenta.id}`} className="flex items-center justify-between border-b border-zinc-100 pb-4 last:border-0 last:pb-0 hover:bg-zinc-50 p-2 -mx-2 rounded-lg transition-colors">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm font-medium text-zinc-900 truncate">{cuenta.asistentes?.nombre}</p>
                    <p className="text-xs text-zinc-500 truncate">{cuenta.concepto}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-red-600">${Number(saldo).toLocaleString()}</p>
                    {isOverdue && (
                      <p className="text-[10px] font-medium text-red-500 flex items-center justify-end gap-1 mt-0.5">
                        <AlertCircle className="w-3 h-3" /> Vencida
                      </p>
                    )}
                  </div>
                </Link>
              )
            })}
            {!cuentasPendientes?.length && (
              <div className="text-center text-sm text-zinc-500 py-8">
                No hay cuentas pendientes.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
