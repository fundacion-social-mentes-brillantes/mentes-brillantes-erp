import { CalendarCheck, Minus, Plus, Receipt, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { leerTodas } from "@/lib/supabase/paginar";
import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";
import { PeriodSelector } from "./PeriodSelector";
import { BuscadorGlobal } from "@/components/layout/BuscadorGlobal";
import { resumenCoach, type CoachPaquete } from "@/lib/utils/coach";
import { fechaHoyBogota } from "@/lib/utils/fechas";
import { Sellos } from "@/components/coach/Sellos";

// La grafica (recharts) y el boton de PDF (jsPDF + html2canvas) son la mitad del
// peso del tablero y ninguno hace falta para ver los numeros: la grafica va
// DEBAJO de las tarjetas y el PDF solo se usa al oprimirlo. Cargandolos aparte,
// el celular deja de bajar ~280 KB antes de mostrar nada.
const BalanceChart = dynamic(() => import("./BalanceChart").then((m) => m.BalanceChart), {
  loading: () => <div className="h-[300px] w-full animate-pulse rounded-xl bg-suave" />,
});
const PdfReportButton = dynamic(() => import("./PdfReportButton").then((m) => m.PdfReportButton), {
  loading: () => <div className="h-10 w-48 animate-pulse rounded-xl bg-suave" />,
});
import { filtrarIngresosOperativos, filtrarIngresosRealesSaldoAFavor, esAnuladoCompleto, filtrarPagosValidosCuentas, sumarMontos } from "@/lib/utils/contable";
import { construirSerieDiaria } from "@/lib/utils/dashboard";
import { pesos } from "@/lib/utils/pesos"

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
function trendPill(trend: number, goodIsUp: boolean, klass = "text-xs") {
  if (trend === 0) {
    return (
      <span className={`inline-flex items-center gap-1 ${klass} font-semibold text-gris bg-suave px-2 py-0.5 rounded-full`}>
        <Minus className="w-3 h-3" /> 0%
      </span>
    );
  }
  const positive = trend > 0;
  const good = (positive && goodIsUp) || (!positive && !goodIsUp);
  return (
    <span className={`inline-flex items-center gap-1 ${klass} font-semibold px-2 py-0.5 rounded-full ${good ? "text-verde bg-verde/12" : "text-rojo bg-rojo/12"}`}>
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(trend)}%
    </span>
  );
}

export async function Dashboard({ periodo: periodoId, nombre, rol }: { periodo?: string; nombre?: string; rol: string }) {
  const supabase = await createClient();
  if (!supabase) return null;

  const now = new Date();

  // --- Períodos (liquidaciones) para el selector y para elegir el actual ---
  const { data: periodosData } = await supabase
    .from("periodos")
    .select("id, nombre, fecha_inicio, fecha_fin, estado, creado_en")
    .order("creado_en", { ascending: false });
  const periodos: Periodo[] = (periodosData ?? []).map((p) => ({
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
  //
  // `conGrafica` es false para el período ANTERIOR, que solo se usa para las
  // flechas de comparación: su gráfica nunca se dibuja. Eso permite saltarse
  // consultas cuando además el período está cerrado y sus cifras ya vienen
  // congeladas de la liquidación.
  const getTotales = async (
    inicio: string,
    fin: string,
    estado: string | null,
    id?: string,
    opciones: { conGrafica?: boolean } = {}
  ): Promise<Totales> => {
    const conGrafica = opciones.conGrafica !== false;

    // Si el período está cerrado, la liquidación manda: sus cifras sobreescriben
    // todo lo que se calcule en vivo. Por eso se pregunta PRIMERO — así, cuando
    // ya hay liquidación y no hace falta la gráfica, las cinco consultas de
    // movimientos ni se piden, porque su resultado se iba a descartar igual.
    const cerrado = estado === "cerrado" && !!id;
    const [{ data: liqRows }, { data: resumenRows }] = cerrado
      ? await Promise.all([
          supabase.from("liquidaciones_socios").select("ingresos_cobrados, donaciones_periodo, ingresos_operativos").eq("periodo_id", id!).limit(1),
          supabase.from("liquidaciones_resumen_cuentas").select("ingresos_ventas_externas, salidas_egresos").eq("periodo_id", id!),
        ])
      : [{ data: null }, { data: null }];

    const hayLiquidacion = Boolean(liqRows && liqRows.length > 0);
    // Salvaguarda: si el período está cerrado pero NO tiene liquidación, se
    // calculan en vivo como siempre. Nunca se muestra un período en blanco.
    const necesitaMovimientos = !hayLiquidacion || conGrafica;
    const vacio = { data: [] as never[] };

    const [
      { data: rawIngresos },
      { data: rawSaldo },
      { data: rawDonaciones },
      { data: rawVentas },
      { data: rawEgresos },
      { data: cuentasRango },
    ] = await Promise.all([
      necesitaMovimientos ? supabase.from("pagos_abonos").select("monto, fecha_pago, metodo_pago, origen_fondos, estado, notas").gte("fecha_pago", inicio).lte("fecha_pago", fin) : vacio,
      necesitaMovimientos ? supabase.from("movimientos_saldo_favor").select("monto, fecha, metodo_pago, tipo, notas").gte("fecha", inicio).lte("fecha", fin) : vacio,
      necesitaMovimientos ? supabase.from("donaciones_asistentes").select("monto, estado, notas, fecha").gte("fecha", inicio).lte("fecha", fin) : vacio,
      necesitaMovimientos ? supabase.from("ventas_externas").select("monto, estado, notas, fecha").gte("fecha", inicio).lte("fecha", fin) : vacio,
      necesitaMovimientos ? supabase.from("egresos").select("monto, fecha, estado, notas").gte("fecha", inicio).lte("fecha", fin) : vacio,
      supabase.from("cuentas_por_cobrar").select("valor_total, pagos_abonos(monto, estado, notas)").gte("fecha_emision", inicio).lte("fecha_emision", fin),
    ]);

    const ingresosData = filtrarIngresosOperativos(rawIngresos ?? [], { excluirSaldoAFavor: true, excluirAplicacionSaldo: true });
    const saldoFavorIngresos = filtrarIngresosRealesSaldoAFavor(rawSaldo ?? []);
    const donacionesValidas = (rawDonaciones ?? []).filter((d) => !esAnuladoCompleto(d));
    const ventasValidas = (rawVentas ?? []).filter((v) => !esAnuladoCompleto(v));
    const egresosValidos = (rawEgresos ?? []).filter((e) => !esAnuladoCompleto(e));

    let ingresosCartera = Math.round(sumarMontos([...ingresosData, ...saldoFavorIngresos]));
    let donaciones = Math.round(donacionesValidas.reduce((a: number, d) => a + Number(d.monto), 0));
    let ventasExternas = Math.round(sumarMontos(ventasValidas));
    let ingresosTotales = Math.round(ingresosCartera + donaciones + ventasExternas);
    let egresos = Math.round(sumarMontos(egresosValidos));
    let utilidad = Math.round(ingresosTotales - egresos);
    let congelado = false;

    // La liquidación ya se consultó arriba; aquí solo se aplican sus cifras.
    if (hayLiquidacion) {
      const liq = liqRows![0];
      ingresosCartera = Math.round(Number(liq.ingresos_cobrados) || 0);
      donaciones = Math.round(Number(liq.donaciones_periodo) || 0);
      ingresosTotales = Math.round(Number(liq.ingresos_operativos ?? ingresosCartera + donaciones) || 0);
      egresos = Math.round((resumenRows ?? []).reduce((a: number, r) => a + Number(r.salidas_egresos || 0), 0));
      ventasExternas = Math.round((resumenRows ?? []).reduce((a: number, r) => a + Number(r.ingresos_ventas_externas || 0), 0));
      utilidad = Math.round(ingresosTotales - egresos);
      congelado = true;
    }

    const facturado = Math.round((cuentasRango ?? []).reduce((acc: number, c) => acc + Number(c.valor_total), 0));
    const pendiente = Math.round((cuentasRango ?? []).reduce((acc: number, c) => {
      const abonado = filtrarPagosValidosCuentas(c.pagos_abonos || []).reduce((s: number, p) => s + Number(p.monto), 0);
      return acc + (Number(c.valor_total) - abonado);
    }, 0));

    // La gráfica del período ANTERIOR nunca se dibuja (solo se lee cur.chartData),
    // y buildDays puede recorrer cientos de días para nada.
    let chartData: Totales["chartData"] = [];
    if (conGrafica) {
      const dias = buildDays(inicio, fin);
      const ingresosDiarios = [
        ...ingresosData.map((it) => ({ fecha: it.fecha_pago, monto: it.monto })),
        ...saldoFavorIngresos.map((it) => ({ fecha: it.fecha, monto: it.monto })),
        ...ventasValidas.map((it) => ({ fecha: it.fecha, monto: it.monto })),
        ...donacionesValidas.map((it) => ({ fecha: it.fecha, monto: it.monto })),
      ];
      const egresosDiarios = egresosValidos.map((it) => ({ fecha: it.fecha, monto: it.monto }));
      chartData = construirSerieDiaria(dias, ingresosDiarios, egresosDiarios);
    }

    return { ingresosCartera, donaciones, ventasExternas, ingresosTotales, egresos, utilidad, facturado, pendiente, chartData, congelado };
  };

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

  // Todo en paralelo: período actual, período anterior y la cartera general.
  //
  // La cartera se pide UNA sola vez. Antes eran dos consultas casi idénticas
  // (las mismas cuentas pendientes, la segunda solo con el filtro de +30 días):
  // ~671 y ~664 filas con sus abonos anidados, 99% de solapamiento, cruzando el
  // país dos veces para sacar dos números. Ahora se trae `fecha_emision` y la
  // parte vieja se separa aquí mismo, con el mismo criterio que usaba el filtro.
  const [cur, prev, carteraTotalRes, deudasRes, coachRes] = await Promise.all([
    getTotales(rangeInicio, rangeFin, periodoEstado, selectedPeriodo?.id),
    prevPeriodo
      ? getTotales(prevPeriodo.fecha_inicio, prevPeriodo.fecha_fin, prevPeriodo.estado, prevPeriodo.id, { conGrafica: false })
      : Promise.resolve(null as Totales | null),
    // Toda la cartera abierta, por paginas: la API corta en 1000 filas y la
    // cartera total del tablero saldria incompleta en cuanto se pasara de ahi.
    leerTodas((desde, hasta) =>
      supabase
        .from("cuentas_por_cobrar")
        .select("valor_total, fecha_emision, pagos_abonos(monto, estado, notas)")
        .in("estado", ["pendiente", "parcial"])
        .order("id")
        .range(desde, hasta)
    ).then((data) => ({ data })),
    // Mostrador: las cuentas pendientes más recientes (la misma consulta de los avisos del encabezado)
    supabase
      .from("cuentas_por_cobrar")
      .select("id, concepto, valor_total, fecha_emision, asistentes(nombre), pagos_abonos(monto, estado, notas)")
      .in("estado", ["pendiente", "parcial"])
      .order("fecha_emision", { ascending: false })
      .limit(8),
    // Mostrador: paquetes coach con sus sesiones, para ver a quién le quedan (misma regla: resumenCoach)
    supabase
      .from("coach_paquetes")
      .select("id, asistente_id, sesiones_compradas, creado_en, asistentes(nombre), coach_sesiones(id, fecha)"),
  ]);

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

  // --- Cartera (acumulado general) — datos ya traídos en paralelo arriba ---
  const carteraTotalData = carteraTotalRes.data;
  // Las cuentas con más de 30 días salen de la misma lista: es exactamente el
  // mismo criterio que tenía la consulta que se eliminó (fecha_emision < corte).
  const carteraAntiguaData = (carteraTotalData ?? []).filter(
    (c) => c.fecha_emision && c.fecha_emision < thirtyDaysAgoStr
  );
  const carteraTotal = Math.round(carteraTotalData?.reduce((acc, curr) => {
    const abonado = filtrarPagosValidosCuentas(curr.pagos_abonos || []).reduce((sum: number, pago) => sum + Number(pago.monto), 0);
    return acc + (Number(curr.valor_total) - abonado);
  }, 0) || 0);
  let carteraAntigua = 0;
  carteraAntiguaData.forEach((curr) => {
    const abonado = filtrarPagosValidosCuentas(curr.pagos_abonos || []).reduce((sum: number, p) => sum + Number(p.monto), 0);
    const pendiente = Number(curr.valor_total) - abonado;
    if (pendiente > 0) carteraAntigua += pendiente;
  });
  carteraAntigua = Math.round(carteraAntigua);

  // --- Mostrador: quién debe y quién tiene sesiones por tomar ---
  // Mismo cálculo de lo pendiente que el resto del ERP (pagos válidos, sin anulados).
  const hoy = fechaHoyBogota();
  const diasEntre = (desde: string, hasta: string) =>
    Math.round((Date.parse(hasta + "T12:00:00") - Date.parse(desde + "T12:00:00")) / 86_400_000);
  const quienDebe = (deudasRes.data ?? [])
    .map((c) => {
      const abonado = filtrarPagosValidosCuentas(c.pagos_abonos || []).reduce((s: number, p) => s + Number(p.monto), 0);
      return {
        id: c.id,
        nombre: c.asistentes?.nombre || "Asistente",
        concepto: c.concepto,
        dias: c.fecha_emision ? diasEntre(c.fecha_emision, hoy) : null,
        pendiente: Math.round(Number(c.valor_total) - abonado),
      };
    })
    .filter((c) => c.pendiente > 0)
    .slice(0, 4);

  type FilaCoach = { asistenteId: string; nombre: string; paquetes: CoachPaquete[]; ultima: string };
  const porAsistente = new Map<string, FilaCoach>();
  for (const p of coachRes.data ?? []) {
    if (!p.asistente_id) continue;
    const fila = porAsistente.get(p.asistente_id) ?? { asistenteId: p.asistente_id, nombre: p.asistentes?.nombre || "Asistente", paquetes: [], ultima: "" };
    fila.paquetes.push(p);
    for (const s of p.coach_sesiones ?? []) if (s.fecha && s.fecha > fila.ultima) fila.ultima = s.fecha;
    if (!fila.ultima && p.creado_en) fila.ultima = p.creado_en.slice(0, 10);
    porAsistente.set(p.asistente_id, fila);
  }
  const conSesiones = [...porAsistente.values()]
    .map((f) => ({ ...f, ...resumenCoach(f.paquetes) }))
    .filter((f) => f.restantes > 0)
    .sort((a, b) => (a.ultima < b.ultima ? 1 : a.ultima > b.ultima ? -1 : 0));

  const hora = Number(new Intl.DateTimeFormat("es-CO", { hour: "numeric", hourCycle: "h23", timeZone: "America/Bogota" }).format(now));
  const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
  // Hasta dos palabras del nombre ("Juan Sebastián"), sin apellidos.
  const primerNombre = (nombre || "").trim().split(/\s+/).slice(0, 2).join(" ");
  const diasParaCerrar = periodoEstado === "abierto" && rangeFin >= hoy ? diasEntre(hoy, rangeFin) : null;

  const utilColor = utilidadMes >= 0 ? "text-verde" : "text-rojo";
  const totalMovido = Math.max(1, ingresosTotales + egresosMes);
  const parteEntro = Math.round((ingresosTotales / totalMovido) * 1000) / 10;

  const atajo = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors";
  const atajoSecundario = `${atajo} border border-white/25 bg-white/10 text-sobre-campo hover:bg-white/20`;

  return (
    <div className="space-y-6 pb-8">
      {/* MOSTRADOR: la franja de color con el buscador y lo que más se hace */}
      <section className="-mx-4 -mt-5 bg-campo px-4 pb-7 pt-2 text-sobre-campo md:-mx-8 md:-mt-7 md:px-8 md:pb-9">
        <p className="text-sm text-sobre-campo-suave">
          <b className="font-semibold text-sobre-campo">{periodoLabel}</b> · {periodoFechasLabel}
          {periodoEstado && <> · {periodoEstado === "abierto" ? "abierto" : "cerrado"}</>}
          {diasParaCerrar !== null && <> · {diasParaCerrar === 0 ? "cierra hoy" : diasParaCerrar === 1 ? "cierra mañana" : `cierra en ${diasParaCerrar} días`}</>}
        </p>
        <p className="mt-5 text-base text-sobre-campo-suave">
          {saludo}
          {primerNombre ? `, ${primerNombre}` : ""}
        </p>
        <h1 className="mt-1 text-[1.75rem] font-bold leading-tight tracking-[-0.01em] md:text-4xl">¿A quién vas a atender?</h1>
        <div className="mt-5 max-w-3xl">
          <BuscadorGlobal userRole={rol} variante="grande" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
          <Link href="/cuentas" className={`${atajo} col-span-2 bg-sobre-campo text-campo hover:bg-sobre-campo/90 sm:col-span-1`}>
            <Plus className="h-4 w-4" aria-hidden /> Registrar pago
          </Link>
          <Link href="/sesiones-coach" className={atajoSecundario}>
            <CalendarCheck className="h-4 w-4" aria-hidden /> Registrar sesión
          </Link>
          <Link href="/cuentas/nueva" className={atajoSecundario}>
            <Receipt className="h-4 w-4" aria-hidden /> Nueva cuenta
          </Link>
          <Link href="/egresos/nuevo" className={`${atajoSecundario} col-span-2 sm:col-span-1`}>
            <TrendingDown className="h-4 w-4" aria-hidden /> Anotar un gasto
          </Link>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* QUIÉN DEBE */}
        <section className="min-w-0 rounded-2xl border border-linea bg-panel p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">Quién debe</h2>
            <Link href="/cuentas?estado=pendiente" className="shrink-0 text-sm font-semibold text-acento underline-offset-4 hover:underline">Ver cuentas</Link>
          </div>
          <p className="mt-0.5 text-sm text-gris">Lo más reciente primero · <span className="cifra">{pesos(carteraTotal)}</span> en total</p>
          <ul className="mt-3 divide-y divide-linea">
            {quienDebe.length === 0 && <li className="py-4 text-sm text-gris">Nadie debe nada por ahora.</li>}
            {quienDebe.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-3">
                <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${d.dias !== null && d.dias >= 30 ? "bg-rojo" : "bg-oro"}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.nombre}</p>
                  <p className="truncate text-sm text-gris">
                    {d.concepto}
                    {d.dias !== null && <> · {d.dias <= 0 ? "hoy" : d.dias === 1 ? "ayer" : `hace ${d.dias} días`}</>}
                  </p>
                </div>
                <Link href={`/cuentas/${d.id}`} className="cifra shrink-0 rounded-lg border border-acento/30 px-3 py-1.5 text-sm font-semibold text-acento transition-colors hover:bg-acento/10">
                  Cobrar {pesos(d.pendiente)}
                </Link>
              </li>
            ))}
            <li className="flex items-center gap-3 py-3">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-rojo" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">Vencida (más de 30 días)</p>
                <p className="text-sm text-gris">Cuentas viejas por revisar</p>
              </div>
              <span className="cifra shrink-0 font-semibold text-rojo">{pesos(carteraAntigua)}</span>
            </li>
          </ul>
        </section>

        {/* SESIONES COACH */}
        <section className="min-w-0 rounded-2xl border border-linea bg-panel p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">Sesiones coach</h2>
            <Link href="/sesiones-coach" className="shrink-0 text-sm font-semibold text-acento underline-offset-4 hover:underline">Ver sesiones</Link>
          </div>
          <p className="mt-0.5 text-sm text-gris">
            {conSesiones.length === 1 ? "1 persona tiene" : `${conSesiones.length} personas tienen`} sesiones por tomar
          </p>
          <ul className="mt-3 divide-y divide-linea">
            {conSesiones.length === 0 && <li className="py-4 text-sm text-gris">Nadie tiene sesiones pendientes.</li>}
            {conSesiones.slice(0, 4).map((f) => (
              <li key={f.asistenteId} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{f.nombre}</p>
                  <p className="text-sm text-gris">
                    {f.realizadas} de {f.compradas} · {f.restantes === 1 ? "le queda 1" : `le quedan ${f.restantes}`}
                  </p>
                  <Sellos tomadas={f.realizadas} total={f.compradas} className="mt-2" />
                </div>
                <Link href={`/asistentes/${f.asistenteId}`} className="shrink-0 rounded-lg border border-acento/30 px-3 py-1.5 text-sm font-semibold text-acento transition-colors hover:bg-acento/10">
                  + Sesión
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* EL PERÍODO: lo que sale en el reporte PDF */}
      <section data-reporte-pdf className="rounded-2xl border border-linea bg-panel p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">El período</h2>
            <p className="mt-0.5 text-sm text-gris">
              {periodoLabel} · {periodoFechasLabel}
              {congelado && " · cifras congeladas de la liquidación cerrada"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodSelector periodos={periodos} currentId={selectedPeriodo?.id} />
            <PdfReportButton displayMonthName={periodoLabel} />
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-10">
          <div>
            <p className="text-sm font-medium text-gris">Utilidad del período</p>
            <p className={`cifra mt-1 text-4xl font-bold tracking-[-0.01em] md:text-5xl ${utilColor}`}>{pesos(utilidadMes)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gris">
              {trendPill(utilidadTrend, true)}
              <span>frente al período anterior</span>
            </div>
            {/* La balanza: cuánto del dinero movido entró y cuánto salió */}
            <div className="mt-5" aria-hidden>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-suave-2">
                <div className="bg-verde" style={{ width: `${parteEntro}%` }} />
                <div className="bg-rojo" style={{ width: `${100 - parteEntro}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-gris">
                <span>Entró</span>
                <span>Salió</span>
              </div>
            </div>
          </div>

          <dl className="divide-y divide-linea border-y border-linea">
            {[
              { nombre: "Entró", detalle: "cartera, donaciones y ventas", valor: ingresosTotales, color: "text-verde", trend: ingresosTotalesTrend, sube: true },
              { nombre: "Salió", detalle: "egresos", valor: egresosMes, color: "text-rojo", trend: egresosTrend, sube: false },
              { nombre: "Por cobrar del período", detalle: "lo facturado que falta", valor: pendienteMes, color: "text-ambar", trend: pendienteTrend, sube: false },
              { nombre: "Facturado", detalle: "cuentas creadas en el período", valor: facturadoMes, color: "text-tinta", trend: facturadoTrend, sube: true },
            ].map((f) => (
              <div key={f.nombre} className="flex items-center justify-between gap-4 py-3">
                <dt className="min-w-0">
                  <span className="block font-medium">{f.nombre}</span>
                  <span className="block text-sm text-gris">{f.detalle}</span>
                </dt>
                <dd className="flex shrink-0 items-center gap-3">
                  <span className="hidden sm:inline">{trendPill(f.trend, f.sube)}</span>
                  <span className={`cifra text-lg font-semibold ${f.color}`}>{pesos(f.valor)}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section data-reporte-pdf className="rounded-2xl border border-linea bg-panel p-5 md:p-6">
        <BalanceChart data={chartData} utilidadMes={utilidadMes} displayMonthName={periodoLabel} />
      </section>

      <section data-reporte-pdf className="rounded-2xl border border-linea bg-panel">
        <h2 className="sr-only">Cartera y desglose</h2>
        <dl className="grid grid-cols-2 lg:grid-cols-4">
          {[
            { nombre: "Ingresos de cartera", detalle: "del período", valor: ingresosMes, color: "text-verde", trend: ingresosTrend as number | undefined },
            { nombre: "Donaciones", detalle: "del período", valor: donacionesMes, color: "text-tinta", trend: donacionesTrend as number | undefined },
            { nombre: "Cartera total", detalle: "todo lo que se debe", valor: carteraTotal, color: "text-ambar", trend: undefined },
            { nombre: "Cartera vencida", detalle: "más de 30 días", valor: carteraAntigua, color: "text-rojo", trend: undefined },
          ].map((b, i) => (
            <div
              key={b.nombre}
              className={`p-5 ${i % 2 === 1 ? "border-l border-linea" : ""} ${i >= 2 ? "border-t border-linea lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}
            >
              <dt className="text-sm font-medium text-gris">
                {b.nombre} <span className="font-normal">· {b.detalle}</span>
              </dt>
              <dd className={`cifra mt-1 text-xl font-semibold md:text-2xl ${b.color}`}>{pesos(b.valor)}</dd>
              {typeof b.trend === "number" && <div className="mt-1.5">{trendPill(b.trend, true)}</div>}
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
