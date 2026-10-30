import type { DbClient } from "@/lib/supabase/types"
import { cargarMediosPago } from "@/lib/medios-pago"
import { cargarTaller, listarTalleres } from "@/lib/operaciones/talleres"
import { ETIQUETA_ESTADO_PAGO, ETIQUETA_ESTADO_TALLER, kitLegible, type EstadoTaller, type Taller } from "@/lib/operaciones/talleres-reglas"
import { listarTraslados } from "@/lib/operaciones/traslados"
import { formatearFechaEvento } from "@/lib/utils/fechas"
import { metodoPagoLegible } from "@/lib/utils/textos"
import { OperacionMcpError } from "./operaciones"
import { enmascarar } from "./escritura/comun"

// Lo que el MCP necesita de Talleres, de las cuentas de dinero y de los
// traslados: encontrar un taller o un inscrito por lo que escribe la persona y
// armar las respuestas de las herramientas de consulta. Las reglas (cupos,
// pagos, permisos de cada cosa) siguen en lib/operaciones/talleres.ts.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()

/** Un taller por su id, su enlace (slug) o parte de su nombre. Si hay varios, pide escoger. */
export async function resolverTaller(supabase: DbClient, texto: string): Promise<Taller> {
  const buscado = String(texto || "").trim()
  if (!buscado) throw new OperacionMcpError("Indica el taller (nombre, enlace o id).")
  const { data, error } = await supabase.from("talleres").select("*").order("fecha_inicio", { ascending: false })
  if (error) throw new OperacionMcpError("No se pudieron leer los talleres.")
  const talleres = (data ?? []) as Taller[]
  if (UUID.test(buscado)) {
    const t = talleres.find((x) => x.id === buscado)
    if (t) return t
  }
  const exacto = talleres.filter((t) => t.slug === buscado.toLowerCase() || sinTildes(t.nombre) === sinTildes(buscado))
  if (exacto.length === 1) return exacto[0]
  const parecidos = talleres.filter((t) => sinTildes(t.nombre).includes(sinTildes(buscado)) || t.slug.includes(buscado.toLowerCase()))
  if (parecidos.length === 1) return parecidos[0]
  if (parecidos.length === 0) {
    throw new OperacionMcpError(`No encontré un taller que se llame "${buscado}". Consulta la lista con la herramienta talleres.`)
  }
  const opciones = parecidos.map((t) => `${t.nombre} (enlace ${t.slug}, id ${t.id})`).join(" | ")
  throw new OperacionMcpError(`Hay varios talleres que coinciden con "${buscado}". Indica cuál: ${opciones}`)
}

type InscripcionBuscada = { id: string; nombre: string; estado: string; valor_acordado: number; asistio: boolean }

/** Un inscrito del taller por su id o por su nombre. */
export async function resolverInscripcion(
  supabase: DbClient,
  tallerId: string,
  datos: { inscripcionId?: string | null; persona?: string | null }
): Promise<InscripcionBuscada> {
  const { data, error } = await supabase
    .from("taller_inscripciones")
    .select("id, nombre, estado, valor_acordado, asistio")
    .eq("taller_id", tallerId)
  if (error) throw new OperacionMcpError("No se pudieron leer los inscritos del taller.")
  const filas = (data ?? []) as InscripcionBuscada[]
  if (datos.inscripcionId) {
    const f = filas.find((x) => x.id === datos.inscripcionId)
    if (!f) throw new OperacionMcpError("Esa inscripción no es de este taller.")
    return f
  }
  const persona = sinTildes(String(datos.persona || ""))
  if (!persona) throw new OperacionMcpError("Indica la persona inscrita (nombre) o el inscripcion_id.")
  const exactas = filas.filter((f) => sinTildes(f.nombre) === persona)
  const candidatas = exactas.length ? exactas : filas.filter((f) => sinTildes(f.nombre).includes(persona))
  if (candidatas.length === 1) return candidatas[0]
  if (candidatas.length === 0) {
    throw new OperacionMcpError(`No hay nadie inscrito en este taller que se llame "${datos.persona}".`)
  }
  const opciones = candidatas.map((f) => `${f.nombre} (inscripcion_id ${f.id})`).join(" | ")
  throw new OperacionMcpError(`Hay varias personas que coinciden con "${datos.persona}". Indica cuál: ${opciones}`)
}

const etiquetaEstado = (estado: string) => ETIQUETA_ESTADO_TALLER[estado as EstadoTaller] ?? estado

/** Herramienta talleres: todos, con sus cifras principales. */
export async function vistaTalleres(supabase: DbClient) {
  const lista = await listarTalleres(supabase)
  return {
    total: lista.length,
    talleres: lista.map(({ taller, resumen }) => ({
      id: taller.id,
      nombre: taller.nombre,
      enlace: taller.slug,
      tipo: taller.tipo,
      estado: etiquetaEstado(taller.estado),
      fecha: formatearFechaEvento(taller.fecha_inicio, "Sin fecha", true),
      lugar: taller.lugar,
      precio: Number(taller.precio || 0),
      cupo: taller.cupo,
      inscritos: resumen.inscritos,
      llegaron: resumen.asistieron,
      con_deuda: resumen.conDeuda,
      esperado: resumen.esperado,
      recaudado: resumen.recaudado,
      por_cobrar: resumen.porCobrar,
      gastos: resumen.gastos,
      queda: resumen.resultado,
    })),
    aclaracion: "La plata de los talleres entra a la fundación como venta externa y sus gastos como egresos: ya está en la liquidación.",
  }
}

/** Herramienta taller: un taller con sus inscritos, pagos y gastos (sin cédulas ni teléfonos completos). */
export async function vistaTaller(supabase: DbClient, texto: string) {
  const t = await resolverTaller(supabase, texto)
  const datos = await cargarTaller(supabase, t.id)
  if (!datos) throw new OperacionMcpError("No encontré ese taller.")
  const { taller, resumen, gastos } = datos
  return {
    id: taller.id,
    nombre: taller.nombre,
    enlace: taller.slug,
    tipo: taller.tipo,
    estado: etiquetaEstado(taller.estado),
    fecha: formatearFechaEvento(taller.fecha_inicio, "Sin fecha", true),
    lugar: taller.lugar,
    precio: Number(taller.precio || 0),
    cupo: taller.cupo,
    cuentas: {
      inscritos: resumen.inscritos,
      cancelados: resumen.cancelados,
      llegaron: resumen.asistieron,
      pagaron_todo: resumen.pagaronTodo,
      con_deuda: resumen.conDeuda,
      esperado: resumen.esperado,
      recaudado: resumen.recaudado,
      por_cobrar: resumen.porCobrar,
      gastos: resumen.gastos,
      queda: resumen.resultado,
    },
    inscritos: resumen.filas.map((f) => ({
      inscripcion_id: f.id,
      nombre: f.nombre,
      identificacion: f.documento ? enmascarar(f.documento) : null,
      edad: f.edad,
      kit: kitLegible(f.kit) || null,
      contacto_movil: f.telefono ? enmascarar(f.telefono) : null,
      estado: f.estado === "cancelado" ? "Cancelada" : "Inscrita",
      llego: f.asistio,
      valor_a_pagar: Number(f.valor_acordado || 0),
      pagado: f.pagado,
      falta: f.pendiente,
      estado_pago: ETIQUETA_ESTADO_PAGO[f.estadoPago],
      como_se_inscribio: f.origen,
      pagos: f.pagos.map((p) => ({ fecha: p.fecha, monto: Number(p.monto), cuenta: metodoPagoLegible(p.metodo_pago) })),
    })),
    gastos: gastos.map((g) => ({
      fecha: g.fecha,
      concepto: g.concepto,
      monto: Number(g.monto),
      categoria: g.categoria,
      cuenta: metodoPagoLegible(g.metodo_pago),
      estado: g.estado,
    })),
  }
}

/** Herramienta cuentas_de_dinero. */
export async function vistaMediosPago(supabase: DbClient) {
  const medios = await cargarMediosPago(supabase, { forzar: true })
  return {
    cuentas: medios.map((m) => ({ clave: m.clave, nombre: m.nombre, activa: m.activo })),
    aclaracion:
      "Usa la clave (o el nombre) en metodo_pago. Las ocultas ya no se ofrecen para pagos nuevos, pero sus pagos de antes siguen en ellas. " +
      "Para pasar plata de una cuenta a otra usa preparar_traslado, que no cuenta como ingreso ni gasto.",
  }
}

/** Herramienta traslados. */
export async function vistaTraslados(supabase: DbClient, opciones: { desde?: string; hasta?: string; limite?: number }) {
  const lista = await listarTraslados(supabase, opciones)
  return {
    total: lista.length,
    traslados: lista.map((t) => ({
      id: t.id,
      fecha: t.fecha,
      monto: Number(t.monto),
      sale_de: metodoPagoLegible(t.metodo_origen),
      llega_a: metodoPagoLegible(t.metodo_destino),
      notas: t.notas,
      estado: t.estado === "anulado" ? `Anulado${t.motivo_anulacion ? `: ${t.motivo_anulacion}` : ""}` : "Vigente",
    })),
    aclaracion: "Un traslado no es ingreso ni gasto: solo mueve lo que hay en cada cuenta (Resumen por cuenta de la liquidación).",
  }
}
