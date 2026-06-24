import { AlertCircle, Receipt, History, Banknote, ShoppingCart, TrendingUp, TrendingDown, Minus, Lock, Gift, Landmark, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
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

// Insignia de tendencia vs período anterior (verde = favorable, rojo = desfavorable)
function trendPill(trend: number, goodIsUp: boolean, klass = "text-[11px]") {
  if (trend === 0) {
    return (
      <span className={`inline-flex items-center gap-1 ${klass} font-semibold text-[rgb(var(--text-muted))] bg-[rgb(var(--muted-surface))] px-2 py-0.5 rounded-full`}>
        <Minus className="w-3 h-3" /> 0%
      </span>
    );
  }
  const positive = trend > 0;
  const good = (positive && goodIsUp) || (!positive && !goodIsUp);
  return (
    <span className={`inline-flex items-center gap-1 ${klass} font-semibold px-2 py-0.5 rounded-full ${good ? "text-[rgb(var(--success))] bg-[rgba(var(--success),0.14)]" : "text-[rgb(var(--danger))] bg-[rgba(var(--danger),0.14)]"}`}>
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(trend)}%
    </span>
  );
}

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

  const selIdx = periodoId ? periodos.findIndex((p) => p.id === periodoId) : 0;
  const selectedPeriodo: Periodo | undefined = periodos[selIdx >= 0 ? selIdx : 0];
  const prevPeriodo: Periodo | undefined = selectedPeriodo
    ? periodos[periodos.indexOf(selectedPeriodo) + 1]
    : undefined;

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

  // Totales de un período: CONGELADOS si cerrado (igual a la liquidación), en vivo si abierto.
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

    const facturado = Math.round((cuentasRango ?? []).reduce((acc: number, c: any) => acc + Number(c.valor_total), 0));
    const pendiente = Math.round((cuentasRango ?? []).reduce((acc: number, c: any) => {
      const abonado = filtrarPagosValidosCuentas(c.pagos_abonos || []).reduce((s: number, p: any) => s + Number(p.monto), 0);
      return acc + (Number(c.valor_total) - abonado);
    }, 0));

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

  const ingresosMes = cur.ingresosCartera;
  const donacionesMes = cur.donaciones;
  const egresosMes = cur.egresos;
  const ingresosTotales = cur.ingresosTotales;
  const utilidadMes = cur.utilidad;
  const facturadoMes = cur.facturado;
  const pendienteMes = cur.pendiente;
  const chartData = cur.chartData;
  const congelado = cur.congelado;

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

  // --- Cartera (acumulado general, no depende del período) ---
  const { data: carteraTotalData } = await supabase
    .from("cuentas_por_cobrar")
    .select("valor_total, pagos_abonos(monto, estado, notas)")
    .in("estado", ["pendiente", "parcial"]);
  const carteraTotal = Math.round(carteraTotalData?.reduce((acc, curr) => {
    const abonado = filtrarPagosValidosCuentas(curr.pagos_abonos || []).reduce((sum: number, pago: any) => sum + Number(pago.monto), 0);
    return acc + (Number(curr.valor_total) - abonado);
  }, 0) || 0);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];
  const { data: carteraAntiguaData } = await supabase
    .from("cuentas_por_cobrar")
    .select("valor_total, pagos_abonos(monto, estado, notas)")
    .in("estado", ["pendiente", "parcial"])
    .lt("fecha_emision", thirtyDaysAgoStr);
  let carteraAntigua = 0;
  carteraAntiguaData?.forEach((curr) => {
    const abonado = filtrarPagosValidosCuentas(curr.pagos_abonos || []).reduce((sum: number, p: any) => sum + Number(p.monto), 0);
    const pendiente = Number(curr.valor_total) - abonado;
    if (pendiente > 0) carteraAntigua += pendiente;
  });
  carteraAntigua = Math.round(carteraAntigua);

  // KPIs del período (4 cápsulas)
  const capsulas = [
    { name: "Ingresos", value: ingresosTotales, trend: ingresosTotalesTrend, goodIsUp: true, icon: Banknote, color: "var(--success)" },
    { name: "Egresos", value: egresosMes, trend: egresosTrend, goodIsUp: false, icon: ShoppingCart, color: "var(--danger)" },
    { name: "Pendiente", value: pendienteMes, trend: pendienteTrend, goodIsUp: false, icon: AlertCircle, color: "var(--warning)" },
    { name: "Facturado", value: facturadoMes, trend: facturadoTrend, goodIsUp: true, icon: Receipt, color: "var(--info)" },
  ];

  // Bento inferior: desglose del período + cartera general
  const bento = [
    { name: "Ingresos de cartera", value: ingresosMes, trend: ingresosTrend, goodIsUp: true, icon: Banknote, color: "var(--success)", caption: "del período" },
    { name: "Donaciones", value: donacionesMes, trend: donacionesTrend, goodIsUp: true, icon: Gift, color: "var(--accent)", caption: "del período" },
    { name: "Cartera total", value: carteraTotal, icon: Landmark, color: "var(--warning)", caption: "por cobrar (general)" },
    { name: "Cartera antigua +30d", value: carteraAntigua, icon: History, color: "var(--danger)", caption: "deuda vencida (general)" },
  ];

  const utilColor = utilidadMes >= 0 ? "var(--warning)" : "var(--danger)";

  return (
    <div id="dashboard-content" className="space-y-6 pb-8">
      {/* HERO: controles + utilidad protagonista */}
      <section className="premium-panel rounded-3xl p-5 md:p-7 overflow-hidden relative animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, rgba(${utilColor},0.18), transparent 70%)` }} />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative hidden sm:block h-12 w-12 shrink-0 rounded-2xl border border-[rgba(var(--gold),0.34)] bg-[rgba(var(--surface-1),0.6)] shadow-soft overflow-hidden">
                <Image src="/logo-mentes-brillantes.png" alt="Mentes Brillantes" fill className="object-contain p-1" sizes="48px" priority />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[rgb(var(--text-primary))]">Dashboard</h1>
                  {periodoEstado && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${periodoEstado === "abierto" ? "bg-[rgba(var(--success),0.14)] text-[rgb(var(--success))]" : "bg-[rgba(var(--warning),0.16)] text-[rgb(var(--warning))]"}`}>
                      {periodoEstado === "cerrado" ? <Lock className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                      {periodoEstado === "abierto" ? "Abierto" : "Cerrado"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[rgb(var(--text-muted))] truncate">{periodoLabel} · {periodoFechasLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <PdfReportButton displayMonthName={periodoLabel} />
              <PeriodSelector periodos={periodos} currentId={selectedPeriodo?.id} />
            </div>
          </div>

          <div className="relative rounded-2xl border border-[rgba(var(--border),0.5)] bg-[rgba(var(--surface-1),0.45)] px-6 py-7 text-center">
            <p className="text-[10px] md:text-xs uppercase tracking-[0.28em] text-[rgb(var(--text-muted))] font-semibold">Utilidad neta del período</p>
            <p className="mt-2 text-4xl md:text-6xl font-black tracking-tight" style={{ color: `rgb(${utilColor})` }}>
              ${utilidadMes.toLocaleString()}
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              {trendPill(utilidadTrend, true, "text-xs")}
              <span className="text-[11px] text-[rgb(var(--text-muted))]">vs período anterior</span>
            </div>
            {congelado && (
              <p className="mt-2 text-[11px] text-[rgb(var(--text-muted))]">Valores congelados de la liquidación cerrada</p>
            )}
          </div>
        </div>
      </section>

      {/* 4 CÁPSULAS KPI */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {capsulas.map((c) => (
          <div key={c.name} className="premium-card rounded-2xl p-4 md:p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-strong">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wide text-[rgb(var(--text-muted))]">{c.name}</p>
              <span className="grid place-items-center h-7 w-7 rounded-full" style={{ backgroundColor: `rgba(${c.color},0.14)`, color: `rgb(${c.color})` }}>
                <c.icon className="h-3.5 w-3.5" />
              </span>
            </div>
            <p className="mt-2 text-xl md:text-2xl font-bold tracking-tight" style={{ color: `rgb(${c.color})` }}>${c.value.toLocaleString()}</p>
            <div className="mt-2">{trendPill(c.trend, c.goodIsUp)}</div>
          </div>
        ))}
      </section>

      {/* GRÁFICA PROTAGONISTA */}
      <section className="premium-panel rounded-3xl p-5 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <BalanceChart data={chartData} utilidadMes={utilidadMes} displayMonthName={periodoLabel} />
      </section>

      {/* BENTO: desglose del período + cartera general */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        {bento.map((b) => (
          <div key={b.name} className="premium-card rounded-2xl p-4 md:p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-strong">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wide text-[rgb(var(--text-muted))] truncate">{b.name}</p>
                <p className="text-[10px] text-[rgb(var(--text-muted))]">{b.caption}</p>
              </div>
              <span className="grid place-items-center h-7 w-7 rounded-full shrink-0" style={{ backgroundColor: `rgba(${b.color},0.14)`, color: `rgb(${b.color})` }}>
                <b.icon className="h-3.5 w-3.5" />
              </span>
            </div>
            <p className="mt-2 text-lg md:text-2xl font-bold tracking-tight" style={{ color: `rgb(${b.color})` }}>${b.value.toLocaleString()}</p>
            {typeof b.trend === "number" && <div className="mt-2">{trendPill(b.trend, b.goodIsUp ?? true)}</div>}
          </div>
        ))}
      </section>
    </div>
  );
}
