import { ArrowUpRight, ArrowDownRight, Users, Wallet, AlertCircle, Receipt, History, Info, Banknote, ShoppingCart, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { MonthSelector } from "./MonthSelector";
import { BalanceChart } from "./BalanceChart";
import { PdfReportButton } from "./PdfReportButton";
import { filtrarIngresosOperativos, esAnuladoCompleto, filtrarPagosValidosCuentas, sumarMontos } from "@/lib/utils/contable";

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

  // Variables para mes anterior (para cÃ¡lculos de tendencia)
  const prevMonthDate = new Date(targetYear, targetMonth - 1, 1);
  const prevMonthYear = prevMonthDate.getFullYear();
  const prevMonthMonth = prevMonthDate.getMonth();
  const firstDayOfPrevMonth = new Date(prevMonthYear, prevMonthMonth, 1).toISOString().split('T')[0];
  const lastDayOfPrevMonth = new Date(prevMonthYear, prevMonthMonth + 1, 0).toISOString().split('T')[0];

  // 1. INDICADORES DEL PERÃODO SELECCIONADO
  
  // Ingresos del Mes
  const { data: rawIngresosData } = await supabase
    .from('pagos_abonos')
    .select('monto, fecha_pago, metodo_pago, origen_fondos, estado, notas')
    .gte('fecha_pago', firstDayOfMonth)
    .lte('fecha_pago', lastDayOfMonth);
    
  const ingresosData = filtrarIngresosOperativos(rawIngresosData ?? [], {
    excluirSaldoAFavor: true,
    excluirAplicacionSaldo: true
  });
  const ingresosMes = Math.round(sumarMontos(ingresosData));

  // Donaciones del Mes
  const { data: rawDonaciones } = await supabase
    .from('donaciones_asistentes')
    .select('monto, estado, notas')
    .gte('fecha', firstDayOfMonth)
    .lte('fecha', lastDayOfMonth);
  const donacionesMes = Math.round((rawDonaciones ?? []).filter(d => d.estado !== 'anulado' && !d.notas?.includes('[ANULADO]')).reduce((acc, d) => acc + Number(d.monto), 0));

  // Egresos del Mes
  const { data: rawEgresosData } = await supabase
    .from('egresos')
    .select('monto, fecha, estado, notas')
    .gte('fecha', firstDayOfMonth)
    .lte('fecha', lastDayOfMonth);
    
  const egresosData = (rawEgresosData ?? []).filter((item) => !esAnuladoCompleto(item));
  const egresosMes = Math.round(sumarMontos(egresosData));
  
  // Utilidad del Mes
  const ingresosTotales = Math.round(ingresosMes + donacionesMes);
  const utilidadMes = Math.round(ingresosTotales - egresosMes);

  // Preparar datos para la grÃ¡fica de balance acumulado
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
      ingresos: dayData.ingresos,
      egresos: dayData.egresos,
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

  // --- DATOS DEL MES ANTERIOR (TENDENCIAS) ---
  const { data: rawIngresosPrev } = await supabase.from('pagos_abonos').select('monto, metodo_pago, origen_fondos, estado, notas').gte('fecha_pago', firstDayOfPrevMonth).lte('fecha_pago', lastDayOfPrevMonth);
  const ingresosPrevData = filtrarIngresosOperativos(rawIngresosPrev ?? [], {
    excluirSaldoAFavor: true,
    excluirAplicacionSaldo: true
  });
  const ingresosPrev = Math.round(sumarMontos(ingresosPrevData));
  const { data: rawDonacionesPrev } = await supabase.from('donaciones_asistentes').select('monto, estado, notas').gte('fecha', firstDayOfPrevMonth).lte('fecha', lastDayOfPrevMonth);
  const donacionesPrev = Math.round((rawDonacionesPrev ?? []).filter(d => d.estado !== 'anulado' && !d.notas?.includes('[ANULADO]')).reduce((acc, d) => acc + Number(d.monto), 0));
  const ingresosTotalesPrev = ingresosPrev + donacionesPrev;

  const { data: rawEgresosPrevData } = await supabase.from('egresos').select('monto, estado, notas').gte('fecha', firstDayOfPrevMonth).lte('fecha', lastDayOfPrevMonth);
  const egresosPrevData = (rawEgresosPrevData ?? []).filter((item) => !esAnuladoCompleto(item));
  const egresosPrev = Math.round(sumarMontos(egresosPrevData));
  const utilidadPrev = ingresosPrev - egresosPrev;

  const { data: cuentasPrevData } = await supabase.from('cuentas_por_cobrar').select('valor_total, pagos_abonos(monto)').gte('fecha_emision', firstDayOfPrevMonth).lte('fecha_emision', lastDayOfPrevMonth);
  const facturadoPrev = Math.round(cuentasPrevData?.reduce((acc, curr) => acc + Number(curr.valor_total), 0) || 0);
  const pendientePrev = Math.round(cuentasPrevData?.reduce((acc, curr) => {
    const abonado = curr.pagos_abonos?.reduce((sum: number, pago: any) => sum + Number(pago.monto), 0) || 0;
    return acc + (Number(curr.valor_total) - abonado);
  }, 0) || 0);

  // Funciones de cÃ¡lculo de tendencia (%)
  const getTrend = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / Math.abs(previous)) * 100);
  };

  const ingresosTrend = getTrend(ingresosMes, ingresosPrev);
  const donacionesTrend = getTrend(donacionesMes, donacionesPrev);
  const ingresosTotalesTrend = getTrend(ingresosTotales, ingresosTotalesPrev);
  const egresosTrend = getTrend(egresosMes, egresosPrev);
  const utilidadTrend = getTrend(utilidadMes, utilidadPrev);
  const facturadoTrend = getTrend(facturadoMes, facturadoPrev);
  const pendienteTrend = getTrend(pendienteMes, pendientePrev);

  // 2. INDICADORES HISTÃ“RICOS APARTE
  
  // Cartera Total (Todas las cuentas pendientes)
  const { data: carteraTotalData } = await supabase
    .from('cuentas_por_cobrar')
    .select('valor_total, pagos_abonos(monto, estado, notas)')
    .in('estado', ['pendiente', 'parcial']);
    
  const carteraTotal = Math.round(carteraTotalData?.reduce((acc, curr) => {
    const abonado = filtrarPagosValidosCuentas(curr.pagos_abonos || []).reduce((sum: number, pago: any) => sum + Number(pago.monto), 0);
    return acc + (Number(curr.valor_total) - abonado);
  }, 0) || 0);
  
  // Cartera Antigua (+30 dÃ­as)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
  
  const { data: carteraAntiguaData } = await supabase
    .from('cuentas_por_cobrar')
    .select('asistente_id, valor_total, pagos_abonos(monto, estado, notas)')
    .in('estado', ['pendiente', 'parcial'])
    .lt('fecha_emision', thirtyDaysAgoStr);
    
  let carteraAntigua = 0;
  const personasAntiguasSet = new Set<string>();
  
  carteraAntiguaData?.forEach(curr => {
    const abonado = filtrarPagosValidosCuentas(curr.pagos_abonos || []).reduce((sum: number, p: any) => sum + Number(p.monto), 0);
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

  // Cuentas Pendientes (Top 5 mÃ¡s recientes para la lista)
  const { data: cuentasPendientesData } = await supabase
    .from('cuentas_por_cobrar')
    .select(`
      id,
      concepto,
      fecha_emision,
      valor_total,
      asistentes ( nombre ),
      pagos_abonos ( monto, estado, notas )
    `)
    .in('estado', ['pendiente', 'parcial'])
    .order('fecha_emision', { ascending: false })
    .limit(5);

  const cuentasPendientes = cuentasPendientesData?.map((cuenta: any) => {
    const pagosValidos = filtrarPagosValidosCuentas(cuenta.pagos_abonos || [])
    const total_abonado = pagosValidos.reduce((sum: number, pago: any) => sum + Number(pago.monto), 0);
    return {
      ...cuenta,
      monto_pendiente: Math.round(Number(cuenta.valor_total) - total_abonado)
    };
  }) || [];

  const periodStats = [
    {
      name: "Ingresos de Cartera",
      value: `$${ingresosMes.toLocaleString()}`,
      trend: ingresosTrend,
      goodIsUp: true,
      icon: Banknote,
      color: "text-[rgb(var(--success))]",
      bg: "bg-[rgba(var(--success),0.12)]",
      tooltip: "Pagos y abonos recibidos (sin saldo a favor) en el mes."
    },
    {
      name: "Donaciones",
      value: `$${donacionesMes.toLocaleString()}`,
      trend: donacionesTrend,
      goodIsUp: true,
      icon: Wallet,
      color: "text-[rgb(var(--info))]",
      bg: "bg-[rgba(var(--info),0.12)]",
      tooltip: "Donaciones voluntarias registradas en el mes."
    },
    {
      name: "Ingresos Totales",
      value: `$${ingresosTotales.toLocaleString()}`,
      trend: ingresosTotalesTrend,
      goodIsUp: true,
      icon: Banknote,
      color: "text-[rgb(var(--success))]",
      bg: "bg-[rgba(var(--success),0.12)]",
      tooltip: "Ingresos de cartera + donaciones del mes."
    },
    {
      name: "Egresos del Período",
      value: `$${egresosMes.toLocaleString()}`,
      trend: egresosTrend,
      goodIsUp: false,
      icon: ShoppingCart,
      color: "text-[rgb(var(--danger))]",
      bg: "bg-[rgba(var(--danger),0.12)]",
      tooltip: "Suma de los gastos registrados dentro del mes seleccionado."
    },
    {
      name: "Utilidad del Período",
      value: `$${utilidadMes.toLocaleString()}`,
      trend: utilidadTrend,
      goodIsUp: true,
      icon: Wallet,
      color: utilidadMes >= 0 ? "text-[rgb(var(--info))]" : "text-[rgb(var(--danger))]",
      bg: utilidadMes >= 0 ? "bg-[rgba(var(--info),0.12)]" : "bg-[rgba(var(--danger),0.12)]",
      tooltip: "Ingresos totales menos egresos del período."
    },
    {
      name: "Facturado del Período",
      value: `$${facturadoMes.toLocaleString()}`,
      trend: facturadoTrend,
      goodIsUp: true,
      icon: Receipt,
      color: "text-[rgb(var(--info))]",
      bg: "bg-[rgba(var(--info),0.12)]",
      tooltip: "Valor total de las cuentas por cobrar creadas en ese mes, aunque no se hayan pagado todavía."
    },
    {
      name: "Pendiente del Período",
      value: `$${pendienteMes.toLocaleString()}`,
      trend: pendienteTrend,
      goodIsUp: false,
      icon: AlertCircle,
      color: "text-[rgb(var(--warning))]",
      bg: "bg-[rgba(var(--warning),0.14)]",
      tooltip: "Saldo que aún falta por cobrar, pero solo de las cuentas creadas en ese mes."
    },
  ];
  
  const historicalStats = [
    {
      name: "Cartera Total",
      value: `$${carteraTotal.toLocaleString()}`,
      icon: Wallet,
      color: "text-[rgb(var(--text-primary))]",
      bg: "bg-[rgb(var(--muted-surface))]",
      tooltip: "Toda la deuda pendiente del sistema, sin importar el mes."
    },
    {
      name: "Cartera Antigua (+30 dÃ­as)",
      value: `$${carteraAntigua.toLocaleString()}`,
      icon: History,
      color: "text-[rgb(var(--danger-strong))]",
      bg: "bg-[rgba(var(--danger),0.12)]",
      tooltip: "Deuda pendiente de cuentas con mÃ¡s de 30 dÃ­as desde su fecha de emisiÃ³n."
    },
    {
      name: "Personas con Deuda Antigua",
      value: personasConCarteraAntigua.toString(),
      icon: Users,
      color: "text-[rgb(var(--warning))]",
      bg: "bg-[rgba(var(--warning),0.18)]",
      tooltip: "Cantidad de asistentes que tienen al menos una cuenta antigua pendiente."
    },
  ];

  const displayMonthName = new Date(targetYear, targetMonth, 1).toLocaleString('es', { month: 'long', year: 'numeric' });

  return (
    <div id="dashboard-content" className="space-y-8 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[rgb(var(--text-primary))]">Dashboard</h1>
          <p className="text-[rgb(var(--text-muted))] text-sm">Resumen financiero y estado de cartera.</p>
        </div>
        <div className="flex items-center gap-3">
          <PdfReportButton displayMonthName={displayMonthName} />
          <MonthSelector currentMonth={currentMonthValue} />
        </div>
      </div>

      {/* 1. INDICADORES DEL PERÃODO */}
      <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))] border-b border-[rgb(var(--border))] pb-2">
          Indicadores del PerÃ­odo <span className="text-[rgb(var(--text-muted))] font-normal text-sm ml-2 capitalize">({displayMonthName})</span>
        </h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {periodStats.map((stat) => {
            const isTrendPositive = stat.trend > 0;
            const isTrendNeutral = stat.trend === 0;
            const trendIsGood = (isTrendPositive && stat.goodIsUp) || (!isTrendPositive && !stat.goodIsUp);
            
            return (
              <div
                key={stat.name}
                className="relative overflow-hidden rounded-2xl border border-[rgba(var(--border),0.5)] bg-[rgba(var(--surface-1),0.6)] backdrop-blur-xl p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium text-[rgb(var(--text-muted))]">{stat.name}</p>
                    <div className="group relative flex items-center">
                      <Info className="w-3.5 h-3.5 text-[rgb(var(--text-muted))] cursor-help outline-none" tabIndex={0} />
                      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 bg-[rgba(var(--surface-3),0.9)] backdrop-blur text-white text-xs rounded-lg p-2.5 shadow-xl z-20 text-center">
                        {stat.tooltip}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[rgba(var(--surface-3),0.9)]"></div>
                      </div>
                    </div>
                  </div>
                  <div className={`p-2 rounded-xl ${stat.bg} backdrop-blur-md`}>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <p className="text-2xl font-bold tracking-tight text-[rgb(var(--text-primary))]">{stat.value}</p>
                  
                  {!isTrendNeutral && (
                    <div className={`flex items-center gap-1 text-xs font-medium ${trendIsGood ? 'text-[rgb(var(--success))] bg-[rgba(var(--success),0.12)]' : 'text-[rgb(var(--danger-strong))] bg-[rgba(var(--danger),0.12)]'} px-1.5 py-0.5 rounded-md`}>
                      {isTrendPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(stat.trend)}%
                    </div>
                  )}
                  {isTrendNeutral && (
                    <div className="flex items-center gap-1 text-xs font-medium text-[rgb(var(--text-muted))] bg-[rgb(var(--muted-surface))] px-1.5 py-0.5 rounded-md">
                      <Minus className="w-3 h-3" />
                      0%
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. INDICADORES HISTÃ“RICOS */}
      <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))] border-b border-[rgb(var(--border))] pb-2">
          Indicadores HistÃ³ricos <span className="text-[rgb(var(--text-muted))] font-normal text-sm ml-2">(Acumulado General)</span>
        </h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {historicalStats.map((stat) => (
            <div
              key={stat.name}
              className="relative overflow-hidden rounded-2xl border border-[rgba(var(--border),0.5)] bg-[rgba(var(--surface-1),0.6)] backdrop-blur-xl p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-1"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-[rgb(var(--text-muted))]">{stat.name}</p>
                  <div className="group relative flex items-center">
                    <Info className="w-4 h-4 text-[rgb(var(--text-muted))] cursor-help outline-none" tabIndex={0} />
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 bg-[rgba(var(--surface-3),0.9)] backdrop-blur text-white text-xs rounded-lg p-3 shadow-xl z-20 text-center">
                      {stat.tooltip}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[rgba(var(--surface-3),0.9)]"></div>
                    </div>
                  </div>
                </div>
                <div className={`p-2 rounded-xl ${stat.bg} backdrop-blur-md`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-bold tracking-tight text-[rgb(var(--text-primary))]">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <div className="lg:col-span-2 rounded-2xl border border-[rgba(var(--border),0.5)] bg-[rgba(var(--surface-1),0.6)] backdrop-blur-xl p-6 shadow-sm flex flex-col">
          <BalanceChart data={chartData} utilidadMes={utilidadMes} displayMonthName={displayMonthName} />
        </div>
        
        <div className="rounded-2xl border border-[rgba(var(--border),0.5)] bg-[rgba(var(--surface-1),0.6)] backdrop-blur-xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-[rgb(var(--text-primary))]">Cuentas Recientes Pendientes</h3>
            <Link href="/cuentas?estado=pendiente" className="text-xs font-medium text-[rgb(var(--info))] hover:text-[rgb(var(--info))]">Ver todas</Link>
          </div>
          <div className="space-y-4 flex-1 overflow-y-auto">
            {cuentasPendientes?.map((cuenta: any) => {
              const saldo = cuenta.monto_pendiente || 0;
              const isOverdue = new Date(cuenta.fecha_emision) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // MÃ¡s de 30 dÃ­as
              return (
                <Link key={cuenta.id} href={`/cuentas/${cuenta.id}`} className="flex items-center justify-between border-b border-[rgb(var(--muted-surface))] pb-4 last:border-0 last:pb-0 hover:bg-zinc-50 p-2 -mx-2 rounded-lg transition-colors">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm font-medium text-[rgb(var(--text-primary))] truncate">{cuenta.asistentes?.nombre}</p>
                    <p className="text-xs text-[rgb(var(--text-muted))] truncate">{cuenta.concepto}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-[rgb(var(--danger-strong))]">${Number(saldo).toLocaleString()}</p>
                    {isOverdue && (
                      <p className="text-[10px] font-medium text-[rgb(var(--danger))] flex items-center justify-end gap-1 mt-0.5">
                        <AlertCircle className="w-3 h-3" /> Vencida
                      </p>
                    )}
                  </div>
                </Link>
              )
            })}
            {!cuentasPendientes?.length && (
              <div className="text-center text-sm text-[rgb(var(--text-muted))] py-8">
                No hay cuentas pendientes.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


