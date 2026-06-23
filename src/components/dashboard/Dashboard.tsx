import { ArrowUpRight, ArrowDownRight, Users, Wallet, AlertCircle, Receipt, History, Info, Banknote, ShoppingCart, TrendingUp, TrendingDown, Minus, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import Image from "next/image";
import { PeriodSelector } from "./PeriodSelector";
import { BalanceChart } from "./BalanceChart";
import { PdfReportButton } from "./PdfReportButton";
import { filtrarIngresosOperativos, filtrarIngresosRealesSaldoAFavor, esAnuladoCompleto, filtrarPagosValidosCuentas, sumarMontos } from "@/lib/utils/contable";
import { construirSerieDiaria } from "@/lib/utils/dashboard";

type Periodo = {
  id: string;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: string;
};

type Totales = {
  ingresosCartera: number;
  donaciones: number;
  ventasExternas: number;
  ingresosTotales: number;
  egresos: number;
  utilidad: number;
  facturado: number;
  pendiente: number;
  chartData: { date: string; ingresos: number; egresos: number; balance: number }[];
  congelado: boolean;
};

export async function Dashboard({ periodo: periodoId }: { periodo?: string }) {
  const supabase = await createClient();
  if (!supabase) return null;

  const now = new Date();

  // --- Períodos (liquidaciones) para el selector y para elegir el actual ---
  const { data: periodosData } = await supabase
    .from("periodos")
    .select("id, nombre, fecha_inicio, fecha_fin, estado, creado_en")
    .order("creado_en", { ascending: false });
  const periodos: Periodo[] = (periodosData ?? []).map((p: any) => ({
    id: p.id,
    nombre: p.nombre,
    fecha_inicio: p.fecha_inicio,
    fecha_fin: p.fecha_fin,
    estado: p.estado,
  }));

  // Período seleccionado: el pedido por id, o el último creado (primero de la lista)
  const selIdx = periodoId ? periodos.findIndex((p) => p.id === periodoId) : 0;
  const selectedPeriodo: Periodo | undefined = periodos[selIdx >= 0 ? selIdx : 0];
  const prevPeriodo: Periodo | undefined = selectedPeriodo
    ? periodos[periodos.indexOf(selectedPeriodo) + 1]
    : undefined;

  // Rango activo: el del período, o (si no hay períodos) el mes calendario actual como respaldo
  let rangeInicio: string;
  let rangeFin: string;
  let periodoLabel: string;
  let periodoEstado: string | null;
  if (selectedPeriodo) {
    rangeInicio = selectedPeriodo.fecha_inicio;
    rangeFin = selectedPeriodo.fecha_fin;
    periodoLabel = selectedPeriodo.nombre;
    periodoEstado = selectedPeriodo.estado;
  } else {
    const y = now.getFullYear();
    const m = now.getMonth();
    rangeInicio = new Date(y, m, 1).toISOString().split("T")[0];
    rangeFin = new Date(y, m + 1, 0).toISOString().split("T")[0];
    periodoLabel = now.toLocaleString("es", { month: "long", year: "numeric" });
    periodoEstado = null;
  }
  const fmtFecha = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
  const periodoFechasLabel = `${fmtFecha(rangeInicio)} – ${fmtFecha(rangeFin)}`;

  // Construye la lista de días del rango (tope: hoy, para no graficar futuro)
  const buildDays = (inicio: string, fin: string) => {
    const fmt = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const [iy, im, idd] = inicio.split("-").map(Number);
    const [fy, fm, fdd] = fin.split("-").map(Number);
    const cursor = new Date(iy, im - 1, idd, 12);
    const endD = new Date(fy, fm - 1, fdd, 12);
    const todayD = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    const realEnd = endD > todayD ? todayD : endD;
    const days: string[] = [];
    let guard = 0;
    while (cursor <= realEnd && guard < 400) {
      days.push(fmt(cursor));
      cursor.setDate(cursor.getDate() + 1);
      guard++;
    }
    return days;
  };

  // Calcula los totales de un período. Si está CERRADO usa los valores
  // CONGELADOS de la liquidación (para cuadrar exactamente con el documento);
  // si está abierto (o es el respaldo del mes) calcula en vivo.
  const getTotales = async (inicio: string, fin: string, estado: string | null, id?: string): Promise<Totales> => {
    const [
      { data: rawIngresos },
      { data: rawSaldo },
      { data: rawDonaciones },
      { data: rawVentas },
      { data: rawEgresos },
      { data: cuentasRango },
    ] = await Promise.all([
      supabase.from("pagos_abonos").select("monto, fecha_pago, metodo_pago, origen_fondos, estado, notas").gte("fecha_pago", inicio).lte("fecha_pago", fin),
      supabase.from("movimientos_saldo_favor").select("monto, fecha, metodo_pago, tipo, notas").gte("fecha", inicio).lte("fecha", fin),
      supabase.from("donaciones_asistentes").select("monto, estado, notas, fecha").gte("fecha", inicio).lte("fecha", fin),
      supabase.from("ventas_externas").select("monto, estado, notas, fecha").gte("fecha", inicio).lte("fecha", fin),
      supabase.from("egresos").select("monto, fecha, estado, notas").gte("fecha", inicio).lte("fecha", fin),
      supabase.from("cuentas_por_cobrar").select("valor_total, pagos_abonos(monto, estado, notas)").gte("fecha_emision", inicio).lte("fecha_emision", fin),
    ]);

    // --- Cálculo en vivo (igual que la liquidación de un período abierto) ---
    const ingresosData = filtrarIngresosOperativos(rawIngresos ?? [], { excluirSaldoAFavor: true, excluirAplicacionSaldo: true });
    const saldoFavorIngresos = filtrarIngresosRealesSaldoAFavor(rawSaldo ?? []);
    const donacionesValidas = (rawDonaciones ?? []).filter((d: any) => !esAnuladoCompleto(d));
    const ventasValidas = (rawVentas ?? []).filter((v: any) => !esAnuladoCompleto(v));
    const egresosValidos = (rawEgresos ?? []).filter((e: any) => !esAnuladoCompleto(e));

    let ingresosCartera = Math.round(sumarMontos([...ingresosData, ...saldoFavorIngresos]));
    let donaciones = Math.round(donacionesValidas.reduce((a: number, d: any) => a + Number(d.monto), 0));
    let ventasExternas = Math.round(sumarMontos(ventasValidas));
    let ingresosTotales = Math.round(ingresosCartera + donaciones + ventasExternas);
    let egresos = Math.round(sumarMontos(egresosValidos));
    let utilidad = Math.round(ingresosTotales - egresos);
    let congelado = false;

    // --- Si está cerrado: usar los valores congelados de la liquidación ---
    if (estado === "cerrado" && id) {
      const [{ data: liqRows }, { data: resumenRows }] = await Promise.all([
        supabase.from("liquidaciones_socios").select("ingresos_cobrados, donaciones_periodo, ingresos_operativos").eq("periodo_id", id).limit(1),
        supabase.from("liquidaciones_resumen_cuentas").select("ingresos_ventas_externas, salidas_egresos").eq("periodo_id", id),
      ]);
      if (liqRows && liqRows.length > 0) {
        const liq: any = liqRows[0];
        ingresosCartera = Math.round(Number(liq.ingresos_cobrados) || 0);
        donaciones = Math.round(Number(liq.donaciones_periodo) || 0);
        ingresosTotales = Math.round(Number(liq.ingresos_operativos ?? ingresosCartera + donaciones) || 0);
        egresos = Math.round((resumenRows ?? []).reduce((a: number, r: any) => a + Number(r.salidas_egresos || 0), 0));
        ventasExternas = Math.round((resumenRows ?? []).reduce((a: number, r: any) => a + Number(r.ingresos_ventas_externas || 0), 0));
        utilidad = Math.round(ingresosTotales - egresos);
        congelado = true;
      }
    }

    // Facturado / Pendiente del período (cuentas emitidas en el rango) — siempre en vivo
    const facturado = Math.round((cuentasRango ?? []).reduce((acc: number, c: any) => acc + Number(c.valor_total), 0));
    const pendiente = Math.round((cuentasRango ?? []).reduce((acc: number, c: any) => {
      const abonado = filtrarPagosValidosCuentas(c.pagos_abonos || []).reduce((s: number, p: any) => s + Number(p.monto), 0);
      return acc + (Number(c.valor_total) - abonado);
    }, 0));

    // Datos para la gráfica de balance diario (siempre en vivo sobre el rango)
    const dias = buildDays(inicio, fin);
    const ingresosDiarios = [
      ...ingresosData.map((it: any) => ({ fecha: it.fecha_pago, monto: it.monto })),
      ...saldoFavorIngresos.map((it: any) => ({ fecha: it.fecha, monto: it.monto })),
      ...ventasValidas.map((it: any) => ({ fecha: it.fecha, monto: it.monto })),
      ...donacionesValidas.map((it: any) => ({ fecha: it.fecha, monto: it.monto })),
    ];
    const egresosDiarios = egresosValidos.map((it: any) => ({ fecha: it.fecha, monto: it.monto }));
    const chartData = construirSerieDiaria(dias, ingresosDiarios, egresosDiarios);

    return { ingresosCartera, donaciones, ventasExternas, ingresosTotales, egresos, utilidad, facturado, pendiente, chartData, congelado };
  };

  const cur = await getTotales(rangeInicio, rangeFin, periodoEstado, selectedPeriodo?.id);
  const prev: Totales | null = prevPeriodo
    ? await getTotales(prevPeriodo.fecha_inicio, prevPeriodo.fecha_fin, prevPeriodo.estado, prevPeriodo.id)
    : null;

  // Variables que usa el resto del componente
  const ingresosMes = cur.ingresosCartera;
  const donacionesMes = cur.donaciones;
  const egresosMes = cur.egresos;
  const ingresosTotales = cur.ingresosTotales;
  const utilidadMes = cur.utilidad;
  const facturadoMes = cur.facturado;
  const pendienteMes = cur.pendiente;
  const chartData = cur.chartData;
  const congelado = cur.congelado;

  // --- Tendencias vs período anterior ---
  const getTrend = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / Math.abs(previous)) * 100);
  };
  const ingresosTrend = getTrend(ingresosMes, prev?.ingresosCartera ?? 0);
  const donacionesTrend = getTrend(donacionesMes, prev?.donaciones ?? 0);
  const ingresosTotalesTrend = getTrend(ingresosTotales, prev?.ingresosTotales ?? 0);
  const egresosTrend = getTrend(egresosMes, prev?.egresos ?? 0);
  const utilidadTrend = getTrend(utilidadMes, prev?.utilidad ?? 0);
  const facturadoTrend = getTrend(facturadoMes, prev?.facturado ?? 0);
  const pendienteTrend = getTrend(pendienteMes, prev?.pendiente ?? 0);

  // 2. INDICADORES HISTÓRICOS APARTE (acumulado general, no dependen del período)

  // Cartera Total (todas las cuentas pendientes)
  const { data: carteraTotalData } = await supabase
    .from("cuentas_por_cobrar")
    .select("valor_total, pagos_abonos(monto, estado, notas)")
    .in("estado", ["pendiente", "parcial"]);
  const carteraTotal = Math.round(carteraTotalData?.reduce((acc, curr) => {
    const abonado = filtrarPagosValidosCuentas(curr.pagos_abonos || []).reduce((sum: number, pago: any) => sum + Number(pago.monto), 0);
    return acc + (Number(curr.valor_total) - abonado);
  }, 0) || 0);

  // Cartera Antigua (+30 días)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

  const { data: carteraAntiguaData } = await supabase
    .from("cuentas_por_cobrar")
    .select("asistente_id, valor_total, pagos_abonos(monto, estado, notas)")
    .in("estado", ["pendiente", "parcial"])
    .lt("fecha_emision", thirtyDaysAgoStr);

  let carteraAntigua = 0;
  const personasAntiguasSet = new Set<string>();
  carteraAntiguaData?.forEach((curr) => {
    const abonado = filtrarPagosValidosCuentas(curr.pagos_abonos || []).reduce((sum: number, p: any) => sum + Number(p.monto), 0);
    const pendiente = Number(curr.valor_total) - abonado;
    if (pendiente > 0) {
      carteraAntigua += pendiente;
      if (curr.asistente_id) personasAntiguasSet.add(curr.asistente_id);
    }
  });
  carteraAntigua = Math.round(carteraAntigua);
  const personasConCarteraAntigua = personasAntiguasSet.size;

  // Cuentas Pendientes (Top 5 más recientes para la lista)
  const { data: cuentasPendientesData } = await supabase
    .from("cuentas_por_cobrar")
    .select(`
      id,
      concepto,
      fecha_emision,
      valor_total,
      asistentes ( nombre ),
      pagos_abonos ( monto, estado, notas )
    `)
    .in("estado", ["pendiente", "parcial"])
    .order("fecha_emision", { ascending: false })
    .limit(5);

  const cuentasPendientes = cuentasPendientesData?.map((cuenta: any) => {
    const pagosValidos = filtrarPagosValidosCuentas(cuenta.pagos_abonos || []);
    const total_abonado = pagosValidos.reduce((sum: number, pago: any) => sum + Number(pago.monto), 0);
    return { ...cuenta, monto_pendiente: Math.round(Number(cuenta.valor_total) - total_abonado) };
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
      help: "Ingresos totales recibidos dentro del período de la liquidación seleccionada.",
    },
    {
      name: "Egresos del Período",
      value: `$${egresosMes.toLocaleString()}`,
      trend: egresosTrend,
      goodIsUp: false,
      icon: ShoppingCart,
      color: "text-[rgb(var(--danger))]",
      bg: "bg-[rgba(var(--danger),0.1)]",
      help: "Gastos registrados dentro del período de la liquidación.",
    },
    {
      name: "Utilidad del Período",
      value: `$${utilidadMes.toLocaleString()}`,
      trend: utilidadTrend,
      goodIsUp: true,
      icon: Wallet,
      color: utilidadMes >= 0 ? "text-[rgb(var(--info))]" : "text-[rgb(var(--danger))]",
      bg: utilidadMes >= 0 ? "bg-[rgba(var(--info),0.1)]" : "bg-[rgba(var(--danger),0.1)]",
      help: "Ingresos totales menos egresos del período (igual que la utilidad neta de la liquidación).",
    },
    {
      name: "Pendiente del Período",
      value: `$${pendienteMes.toLocaleString()}`,
      trend: pendienteTrend,
      goodIsUp: false,
      icon: AlertCircle,
      color: "text-[rgb(var(--warning))]",
      bg: "bg-[rgba(var(--warning),0.12)]",
      help: "Saldo por cobrar de las cuentas emitidas dentro del período.",
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
      help: "Pagos y abonos cobrados (sin saldo a favor) dentro del período.",
    },
    {
      name: "Donaciones",
      value: `$${donacionesMes.toLocaleString()}`,
      trend: donacionesTrend,
      goodIsUp: true,
      icon: Wallet,
      color: "text-[rgb(var(--info))]",
      bg: "bg-[rgba(var(--info),0.08)]",
      help: "Donaciones voluntarias registradas dentro del período.",
    },
    {
      name: "Facturado del Período",
      value: `$${facturadoMes.toLocaleString()}`,
      trend: facturadoTrend,
      goodIsUp: true,
      icon: Receipt,
      color: "text-[rgb(var(--info))]",
      bg: "bg-[rgba(var(--info),0.08)]",
      help: "Valor total de cuentas por cobrar emitidas dentro del período (pagadas o no).",
    },
  ];

  const historicalStats = [
    {
      name: "Cartera Total",
      value: `$${carteraTotal.toLocaleString()}`,
      icon: Wallet,
      color: "text-[rgb(var(--text-primary))]",
      bg: "bg-[rgb(var(--muted-surface))]",
      tooltip: "Toda la deuda pendiente del sistema, sin importar el período.",
    },
    {
      name: "Cartera Antigua (+30 días)",
      value: `$${carteraAntigua.toLocaleString()}`,
      icon: History,
      color: "text-[rgb(var(--danger-strong))]",
      bg: "bg-[rgba(var(--danger),0.12)]",
      tooltip: "Deuda pendiente de cuentas con más de 30 días desde su fecha de emisión.",
    },
    {
      name: "Personas con Deuda Antigua",
      value: personasConCarteraAntigua.toString(),
      icon: Users,
      color: "text-[rgb(var(--warning))]",
      bg: "bg-[rgba(var(--warning),0.18)]",
      tooltip: "Cantidad de asistentes que tienen al menos una cuenta antigua pendiente.",
    },
  ];

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
            <PdfReportButton displayMonthName={periodoLabel} />
            <PeriodSelector periodos={periodos} currentId={selectedPeriodo?.id} />
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

      {/* Resumen del período */}
      <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))]">
              Resumen del período <span className="text-[rgb(var(--text-muted))] font-normal text-sm ml-1">({periodoLabel})</span>
            </h2>
            {periodoEstado && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${periodoEstado === 'abierto' ? 'bg-[rgba(var(--success),0.14)] text-[rgb(var(--success))]' : 'bg-[rgba(var(--warning),0.16)] text-[rgb(var(--warning))]'}`}>
                {periodoEstado === 'cerrado' && <Lock className="w-3 h-3" />}
                {periodoEstado === 'abierto' ? 'Abierto' : 'Cerrado'}
              </span>
            )}
            <span className="text-xs text-[rgb(var(--text-muted))]">{periodoFechasLabel}</span>
          </div>
          <p className="text-sm text-[rgb(var(--text-muted))]">
            Datos de la última liquidación{congelado ? ' (valores congelados al cerrar)' : ''}. Comparativo vs período anterior.
          </p>
          <p className="text-sm font-medium text-[rgb(var(--text-primary))]">
            En este período ingresaron <span className="text-[rgb(var(--success))]">${ingresosTotales.toLocaleString()}</span>, se gastaron <span className="text-[rgb(var(--danger))]">${egresosMes.toLocaleString()}</span>, la utilidad fue <span className="text-[rgb(var(--info))]">${utilidadMes.toLocaleString()}</span> y quedan <span className="text-[rgb(var(--warning))]">${pendienteMes.toLocaleString()}</span> por cobrar.
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
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 bg-[rgba(var(--surface-3),0.9)] backdrop-blur text-[rgb(var(--text-primary))] text-xs rounded-lg p-3 shadow-xl z-20 text-center">
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
          <BalanceChart data={chartData} utilidadMes={utilidadMes} displayMonthName={periodoLabel} />
        </div>

        <div className="premium-panel rounded-3xl p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-[rgb(var(--text-primary))]">Cuentas Recientes Pendientes</h3>
            <Link href="/cuentas?estado=pendiente" className="text-xs font-medium text-[rgb(var(--info))] hover:text-[rgb(var(--info))]">Ver todas</Link>
          </div>
          <div className="space-y-4 flex-1 overflow-y-auto">
            {cuentasPendientes?.map((cuenta: any) => {
              const saldo = cuenta.monto_pendiente || 0;
              const isOverdue = new Date(cuenta.fecha_emision) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
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
