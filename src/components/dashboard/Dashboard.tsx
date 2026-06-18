import { ArrowUpRight, ArrowDownRight, Users, Wallet, AlertCircle, Receipt, History, Info, Banknote, ShoppingCart, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import Image from "next/image";
import { MonthSelector } from "./MonthSelector";
import { BalanceChart } from "./BalanceChart";
import { PdfReportButton } from "./PdfReportButton";
import { filtrarIngresosOperativos, filtrarIngresosRealesSaldoAFavor, esAnuladoCompleto, filtrarPagosValidosCuentas, sumarMontos } from "@/lib/utils/contable";
import { construirSerieDiaria } from "@/lib/utils/dashboard";

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
  const { data: rawSaldoFavorMes } = await supabase
    .from('movimientos_saldo_favor')
    .select('monto, fecha, metodo_pago, tipo, notas')
    .gte('fecha', firstDayOfMonth)
    .lte('fecha', lastDayOfMonth);
  const saldoFavorIngresosMes = filtrarIngresosRealesSaldoAFavor(rawSaldoFavorMes ?? []);
  const ingresosMes = Math.round(sumarMontos([...ingresosData, ...saldoFavorIngresosMes]));

  // Donaciones del Mes
  const { data: rawDonaciones } = await supabase
    .from('donaciones_asistentes')
    .select('monto, estado, notas, fecha')
    .gte('fecha', firstDayOfMonth)
    .lte('fecha', lastDayOfMonth);
  const donacionesData = (rawDonaciones ?? []).filter((item) => !esAnuladoCompleto(item));
  const donacionesMes = Math.round(donacionesData.reduce((acc, d) => acc + Number(d.monto), 0));

  const { data: rawVentasExternas } = await supabase
    .from('ventas_externas')
    .select('monto, estado, notas, fecha')
    .gte('fecha', firstDayOfMonth)
    .lte('fecha', lastDayOfMonth);
  const ventasExternasData = (rawVentasExternas ?? []).filter((item) => !esAnuladoCompleto(item));
  const ventasExternasMes = Math.round(sumarMontos(ventasExternasData));

  // Egresos del Mes
  const { data: rawEgresosData } = await supabase
    .from('egresos')
    .select('monto, fecha, estado, notas')
    .gte('fecha', firstDayOfMonth)
    .lte('fecha', lastDayOfMonth);
    
  const egresosData = (rawEgresosData ?? []).filter((item) => !esAnuladoCompleto(item));
  const egresosMes = Math.round(sumarMontos(egresosData));
  
  // Utilidad del Mes
  const ingresosTotales = Math.round(ingresosMes + donacionesMes + ventasExternasMes);
  const utilidadMes = Math.round(ingresosTotales - egresosMes);

  // Preparar datos para la grÃ¡fica de balance acumulado (incluye donaciones,
  // para que el grafico cuadre con el KPI de ingresos totales).
  const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const isCurrentMonth = now.getFullYear() === targetYear && now.getMonth() === targetMonth;
  const lastDayToProcess = isCurrentMonth ? now.getDate() : daysInMonth;

  const diasGrafica: string[] = [];
  for (let i = 1; i <= lastDayToProcess; i++) {
    diasGrafica.push(`${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`);
  }

  const ingresosDiarios = [
    ...(ingresosData ?? []).map((item: any) => ({ fecha: item.fecha_pago, monto: item.monto })),
    ...saldoFavorIngresosMes.map((item: any) => ({ fecha: item.fecha, monto: item.monto })),
    ...ventasExternasData.map((item: any) => ({ fecha: item.fecha, monto: item.monto })),
    ...donacionesData.map((item: any) => ({ fecha: item.fecha, monto: item.monto })),
  ];
  const egresosDiarios = egresosData.map((item: any) => ({ fecha: item.fecha, monto: item.monto }));

  const chartData = construirSerieDiaria(diasGrafica, ingresosDiarios, egresosDiarios);

  // Facturado y Pendiente del Mes
  const { data: cuentasPeriodoData } = await supabase
    .from('cuentas_por_cobrar')
    .select('valor_total, pagos_abonos(monto, estado, notas)')
    .gte('fecha_emision', firstDayOfMonth)
    .lte('fecha_emision', lastDayOfMonth);
    
  const facturadoMes = Math.round(cuentasPeriodoData?.reduce((acc, curr) => acc + Number(curr.valor_total), 0) || 0);
  const pendienteMes = Math.round(cuentasPeriodoData?.reduce((acc, curr) => {
    const pagosValidos = filtrarPagosValidosCuentas(curr.pagos_abonos || []);
    const abonado = pagosValidos.reduce((sum: number, pago: any) => sum + Number(pago.monto), 0);
    return acc + (Number(curr.valor_total) - abonado);
  }, 0) || 0);

  // --- DATOS DEL MES ANTERIOR (TENDENCIAS) ---
  const { data: rawIngresosPrev } = await supabase.from('pagos_abonos').select('monto, metodo_pago, origen_fondos, estado, notas').gte('fecha_pago', firstDayOfPrevMonth).lte('fecha_pago', lastDayOfPrevMonth);
  const ingresosPrevData = filtrarIngresosOperativos(rawIngresosPrev ?? [], {
    excluirSaldoAFavor: true,
    excluirAplicacionSaldo: true
  });
  const { data: rawSaldoFavorPrev } = await supabase
    .from('movimientos_saldo_favor')
    .select('monto, fecha, metodo_pago, tipo, notas')
    .gte('fecha', firstDayOfPrevMonth)
    .lte('fecha', lastDayOfPrevMonth);
  const saldoFavorIngresosPrev = filtrarIngresosRealesSaldoAFavor(rawSaldoFavorPrev ?? []);
  const ingresosPrev = Math.round(sumarMontos([...ingresosPrevData, ...saldoFavorIngresosPrev]));
  const { data: rawDonacionesPrev } = await supabase.from('donaciones_asistentes').select('monto, estado, notas').gte('fecha', firstDayOfPrevMonth).lte('fecha', lastDayOfPrevMonth);
  const donacionesPrev = Math.round((rawDonacionesPrev ?? []).filter((item) => !esAnuladoCompleto(item)).reduce((acc, d) => acc + Number(d.monto), 0));
  const { data: rawVentasExternasPrev } = await supabase.from('ventas_externas').select('monto, estado, notas').gte('fecha', firstDayOfPrevMonth).lte('fecha', lastDayOfPrevMonth);
  const ventasExternasPrev = Math.round((rawVentasExternasPrev ?? []).filter((item) => !esAnuladoCompleto(item)).reduce((acc, v) => acc + Number(v.monto), 0));
  const ingresosTotalesPrev = ingresosPrev + donacionesPrev + ventasExternasPrev;

  const { data: rawEgresosPrevData } = await supabase.from('egresos').select('monto, estado, notas').gte('fecha', firstDayOfPrevMonth).lte('fecha', lastDayOfPrevMonth);
  const egresosPrevData = (rawEgresosPrevData ?? []).filter((item) => !esAnuladoCompleto(item));
  const egresosPrev = Math.round(sumarMontos(egresosPrevData));
  const utilidadPrev = ingresosTotalesPrev - egresosPrev;

  const { data: cuentasPrevData } = await supabase.from('cuentas_por_cobrar').select('valor_total, pagos_abonos(monto, estado, notas)').gte('fecha_emision', firstDayOfPrevMonth).lte('fecha_emision', lastDayOfPrevMonth);
  const facturadoPrev = Math.round(cuentasPrevData?.reduce((acc, curr) => acc + Number(curr.valor_total), 0) || 0);
  const pendientePrev = Math.round(cuentasPrevData?.reduce((acc, curr) => {
    const abonado = filtrarPagosValidosCuentas(curr.pagos_abonos || []).reduce((sum: number, pago: any) => sum + Number(pago.monto), 0);
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

  const mainStats = [
    {
      name: "Ingresos",
      value: `$${ingresosTotales.toLocaleString()}`,
      trend: ingresosTotalesTrend,
      goodIsUp: true,
      icon: Banknote,
      color: "text-[rgb(var(--success))]",
      bg: "bg-[rgba(var(--success),0.1)]",
      help: "Ingresos recibidos en el mes seleccionado."
    },
    {
      name: "Egresos del Período",
      value: `$${egresosMes.toLocaleString()}`,
      trend: egresosTrend,
      goodIsUp: false,
      icon: ShoppingCart,
      color: "text-[rgb(var(--danger))]",
      bg: "bg-[rgba(var(--danger),0.1)]",
      help: "Gastos registrados dentro del mes seleccionado."
    },
    {
      name: "Utilidad del Período",
      value: `$${utilidadMes.toLocaleString()}`,
      trend: utilidadTrend,
      goodIsUp: true,
      icon: Wallet,
      color: utilidadMes >= 0 ? "text-[rgb(var(--info))]" : "text-[rgb(var(--danger))]",
      bg: utilidadMes >= 0 ? "bg-[rgba(var(--info),0.1)]" : "bg-[rgba(var(--danger),0.1)]",
      help: "Ingresos totales menos egresos del período."
    },
    {
      name: "Pendiente del Período",
      value: `$${pendienteMes.toLocaleString()}`,
      trend: pendienteTrend,
      goodIsUp: false,
      icon: AlertCircle,
      color: "text-[rgb(var(--warning))]",
      bg: "bg-[rgba(var(--warning),0.12)]",
      help: "Saldo por cobrar de las cuentas creadas en el mes."
    },
  ];

  const detailStats = [
    {
      name: "Ingresos de Cartera",
      value: `$${ingresosMes.toLocaleString()}`,
      trend: ingresosTrend,
      goodIsUp: true,
      icon: Banknote,
      color: "text-[rgb(var(--success))]",
      bg: "bg-[rgba(var(--success),0.08)]",
      help: "Pagos y abonos recibidos (sin saldo a favor) en el mes."
    },
    {
      name: "Donaciones",
      value: `$${donacionesMes.toLocaleString()}`,
      trend: donacionesTrend,
      goodIsUp: true,
      icon: Wallet,
      color: "text-[rgb(var(--info))]",
      bg: "bg-[rgba(var(--info),0.08)]",
      help: "Donaciones voluntarias registradas en el mes."
    },
    {
      name: "Facturado del Período",
      value: `$${facturadoMes.toLocaleString()}`,
      trend: facturadoTrend,
      goodIsUp: true,
      icon: Receipt,
      color: "text-[rgb(var(--info))]",
      bg: "bg-[rgba(var(--info),0.08)]",
      help: "Valor total de cuentas por cobrar creadas en el mes (pagadas o no)."
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
      <div className="premium-panel rounded-3xl p-5 md:p-6 overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative hidden sm:block h-16 w-16 shrink-0 rounded-2xl border border-[rgba(var(--gold),0.34)] bg-[rgba(var(--surface-1),0.6)] shadow-soft overflow-hidden">
              <Image
                src="/logo-mentes-brillantes.png"
                alt="Gimnasio Emocional Mentes Brillantes"
                fill
                className="object-contain p-1.5"
                sizes="64px"
                priority
              />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.24em] text-[rgb(var(--warning))] font-semibold">Panel financiero</p>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[rgb(var(--text-primary))]">Dashboard</h1>
              <p className="text-[rgb(var(--text-muted))] text-sm">Resumen ejecutivo y estado de cartera de Mentes Brillantes.</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <PdfReportButton displayMonthName={displayMonthName} />
            <MonthSelector currentMonth={currentMonthValue} />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-[rgba(var(--border),0.56)] bg-[rgba(var(--surface-1),0.5)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--text-muted))]">Ingresos</p>
            <p className="mt-1 text-2xl font-bold text-[rgb(var(--success))]">${ingresosTotales.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-[rgba(var(--border),0.56)] bg-[rgba(var(--surface-1),0.5)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--text-muted))]">Egresos</p>
            <p className="mt-1 text-2xl font-bold text-[rgb(var(--danger))]">${egresosMes.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-[rgba(var(--border),0.56)] bg-[rgba(var(--surface-1),0.5)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--text-muted))]">Utilidad</p>
            <p className={`mt-1 text-2xl font-bold ${utilidadMes >= 0 ? 'text-[rgb(var(--warning))]' : 'text-[rgb(var(--danger))]'}`}>${utilidadMes.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Resumen del mes */}
      <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))]">
            Resumen del mes <span className="text-[rgb(var(--text-muted))] font-normal text-sm ml-2 capitalize">({displayMonthName})</span>
          </h2>
          <p className="text-sm text-[rgb(var(--text-muted))]">Cuatro KPIs clave y, debajo, el detalle financiero del período.</p>
          <p className="text-sm font-medium text-[rgb(var(--text-primary))]">
            En {displayMonthName} ingresaron <span className="text-[rgb(var(--success))]">${ingresosTotales.toLocaleString()}</span>, se gastaron <span className="text-[rgb(var(--danger))]">${egresosMes.toLocaleString()}</span>, la utilidad fue <span className="text-[rgb(var(--info))]">${utilidadMes.toLocaleString()}</span> y quedan <span className="text-[rgb(var(--warning))]">${pendienteMes.toLocaleString()}</span> por cobrar.
          </p>
        </div>

        {/* Top 4 tarjetas principales */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {mainStats.map((stat) => {
            const isTrendPositive = stat.trend > 0;
            const isTrendNeutral = stat.trend === 0;
            const trendIsGood = (isTrendPositive && stat.goodIsUp) || (!isTrendPositive && !stat.goodIsUp);
            return (
              <div
                key={stat.name}
                className="premium-card rounded-2xl p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--text-muted))]">{stat.name}</p>
                      <details className="group">
                        <summary className="list-none cursor-pointer text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-primary))] text-[11px] font-semibold inline-flex items-center gap-1">
                          <Info className="w-3.5 h-3.5 inline-block align-middle" /> Ayuda
                        </summary>
                        <div className="mt-2 text-xs text-[rgb(var(--text-primary))] bg-[rgb(var(--surface-2))] border border-[rgb(var(--border))] rounded-lg p-2.5 shadow-lg w-56">
                          {stat.help}
                        </div>
                      </details>
                    </div>
                    <p className="text-2xl font-bold tracking-tight text-[rgb(var(--text-primary))]">{stat.value}</p>
                  </div>
                  <div className={`p-2.5 rounded-xl ${stat.bg} border border-[rgba(var(--border),0.36)] shadow-[inset_0_1px_0_rgba(var(--glass-highlight),0.08)]`}>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {isTrendNeutral ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--text-muted))] bg-[rgb(var(--muted-surface))] px-2 py-1 rounded-md">
                      <Minus className="w-3 h-3" /> 0%
                    </span>
                  ) : (
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md ${trendIsGood ? 'text-[rgb(var(--success))] bg-[rgba(var(--success),0.12)]' : 'text-[rgb(var(--danger-strong))] bg-[rgba(var(--danger),0.12)]'}`}>
                      {isTrendPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(stat.trend)}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Detalle del período */}
        <div className="premium-panel rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-[rgb(var(--text-primary))]">Detalle del período</h3>
            <span className="text-xs text-[rgb(var(--text-muted))]">Ingresos de cartera, donaciones y facturado</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {detailStats.map((stat) => {
              const isTrendPositive = stat.trend > 0;
              const isTrendNeutral = stat.trend === 0;
              const trendIsGood = (isTrendPositive && stat.goodIsUp) || (!isTrendPositive && !stat.goodIsUp);
              return (
                <div key={stat.name} className="rounded-xl border border-[rgba(var(--border),0.5)] bg-[rgba(var(--surface-2),0.64)] p-3 shadow-[inset_0_1px_0_rgba(var(--glass-highlight),0.06)]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium text-[rgb(var(--text-muted))]">{stat.name}</p>
                        <details className="group">
                          <summary className="list-none cursor-pointer text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-primary))] text-[11px] font-semibold inline-flex items-center gap-1">
                            <Info className="w-3 h-3 inline-block align-middle" /> Ayuda
                          </summary>
                          <div className="mt-2 text-xs text-[rgb(var(--text-primary))] bg-[rgb(var(--surface-2))] border border-[rgb(var(--border))] rounded-lg p-2 shadow-lg w-52">
                            {stat.help}
                          </div>
                        </details>
                      </div>
                      <p className="text-lg font-semibold text-[rgb(var(--text-primary))]">{stat.value}</p>
                    </div>
                    <div className={`p-2 rounded-lg ${stat.bg}`}>
                      <stat.icon className={`h-4 w-4 ${stat.color}`} />
                    </div>
                  </div>
                  <div className="mt-2">
                    {isTrendNeutral ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[rgb(var(--text-muted))] bg-[rgb(var(--muted-surface))] px-2 py-1 rounded-md">
                        <Minus className="w-3 h-3" /> 0%
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md ${trendIsGood ? 'text-[rgb(var(--success))] bg-[rgba(var(--success),0.12)]' : 'text-[rgb(var(--danger-strong))] bg-[rgba(var(--danger),0.12)]'}`}>
                        {isTrendPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {Math.abs(stat.trend)}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Indicadores históricos / cartera */}
      <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))] border-b premium-divider pb-2">
          Indicadores históricos y cartera <span className="text-[rgb(var(--text-muted))] font-normal text-sm ml-2">(Acumulado general)</span>
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {historicalStats.map((stat) => (
            <div
              key={stat.name}
              className="premium-card rounded-2xl p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
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
              <div className="mt-3">
                <p className="text-2xl font-semibold tracking-tight text-[rgb(var(--text-primary))]">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <div className="lg:col-span-2 premium-panel rounded-3xl p-6 flex flex-col">
          <BalanceChart data={chartData} utilidadMes={utilidadMes} displayMonthName={displayMonthName} />
        </div>
        
        <div className="premium-panel rounded-3xl p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-[rgb(var(--text-primary))]">Cuentas Recientes Pendientes</h3>
            <Link href="/cuentas?estado=pendiente" className="text-xs font-medium text-[rgb(var(--info))] hover:text-[rgb(var(--info))]">Ver todas</Link>
          </div>
          <div className="space-y-4 flex-1 overflow-y-auto">
            {cuentasPendientes?.map((cuenta: any) => {
              const saldo = cuenta.monto_pendiente || 0;
              const isOverdue = new Date(cuenta.fecha_emision) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // MÃ¡s de 30 dÃ­as
              return (
                <Link key={cuenta.id} href={`/cuentas/${cuenta.id}`} className="flex items-center justify-between border-b border-[rgba(var(--border),0.42)] pb-4 last:border-0 last:pb-0 hover:bg-[rgba(var(--gold),0.07)] p-2 -mx-2 rounded-xl transition-colors">
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


