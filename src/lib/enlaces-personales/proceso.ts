import type { DbClient } from "@/lib/supabase/types"
import { filtrarPagosValidos, sumarMontos, toSafeNumber } from "@/lib/utils/contable"
import { resumenCoach } from "@/lib/utils/coach"

// Lo que ve cada persona en su pagina "Mi proceso" (/p/<token>): sus sesiones
// de coach y lo que ha pagado y le falta. Solo lectura, y solo lo suyo.
//
// Muchas personas tienen decenas de cuentas casi iguales ("sesion coach"), asi
// que se agrupan por concepto: primero lo que falta, y lo ya pagado resumido.

export type GrupoCuenta = {
  concepto: string
  cantidad: number
  total: number
  pagado: number
  falta: number
}

export type ProcesoPersona = {
  nombre: string
  primerNombre: string
  /** Desde cuando va su proceso (AAAA-MM-DD), si se sabe. */
  desde: string | null
  /** Fechas (AAAA-MM-DD) de las sesiones tomadas, de la mas vieja a la mas nueva. */
  sesiones: string[]
  tomadas: number
  porTomar: number
  totalPagado: number
  totalFalta: number
  pendientes: GrupoCuenta[]
  pagadas: GrupoCuenta[]
  cuentasPagadas: number
}

type CuentaLeida = {
  concepto: string | null
  valor_total: number | string | null
  pagos_abonos?: Array<{ monto?: number | string; estado?: string | null; notas?: string | null }> | null
}

type PaqueteLeido = {
  id: string
  sesiones_compradas?: number | string | null
  creado_en?: string | null
  coach_sesiones?: Array<{ fecha: string | null }> | null
}

const sinTildes = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "")
const claveConcepto = (concepto: string) => sinTildes(concepto).toLowerCase().replace(/\s+/g, " ").trim()
const conMayuscula = (texto: string) => (texto ? texto.charAt(0).toLocaleUpperCase("es") + texto.slice(1) : texto)
const tildes = (texto: string) => (texto.match(/[áéíóúüñÁÉÍÓÚÜÑ]/g) || []).length

export function primerNombre(nombre: string): string {
  const palabra = nombre.trim().split(/\s+/)[0] || ""
  return conMayuscula(palabra.toLocaleLowerCase("es"))
}

/** Arma la pagina con lo ya leido de la base (separado para poder probarlo). */
export function armarProceso(datos: {
  nombre: string
  fechaInicioProceso: string | null
  cuentas: CuentaLeida[]
  paquetes: PaqueteLeido[]
}): ProcesoPersona {
  const grupos = new Map<string, GrupoCuenta>()
  let totalPagado = 0
  let totalFalta = 0
  let cuentasPagadas = 0

  for (const cuenta of datos.cuentas) {
    const total = Math.round(toSafeNumber(cuenta.valor_total))
    const pagado = Math.round(toSafeNumber(sumarMontos(filtrarPagosValidos(cuenta.pagos_abonos || []))))
    const falta = Math.max(0, total - pagado)
    totalPagado += pagado
    totalFalta += falta
    if (falta === 0) cuentasPagadas += 1

    const concepto = (cuenta.concepto || "Sin concepto").replace(/\s+/g, " ").trim()
    // Una clave por concepto y por si ya esta pago, para separar lo que falta de lo pagado.
    const clave = `${falta > 0 ? "falta" : "pagado"}|${claveConcepto(concepto)}`
    const grupo = grupos.get(clave) || { concepto: conMayuscula(concepto), cantidad: 0, total: 0, pagado: 0, falta: 0 }
    // De las formas en que se escribio el concepto, se muestra la que trae tildes.
    if (tildes(concepto) > tildes(grupo.concepto)) grupo.concepto = conMayuscula(concepto)
    grupo.cantidad += 1
    grupo.total += total
    grupo.pagado += Math.min(pagado, total)
    grupo.falta += falta
    grupos.set(clave, grupo)
  }

  const todos = [...grupos.entries()]
  const pendientes = todos
    .filter(([clave]) => clave.startsWith("falta|"))
    .map(([, g]) => g)
    .sort((a, b) => b.falta - a.falta)
  const pagadas = todos
    .filter(([clave]) => clave.startsWith("pagado|"))
    .map(([, g]) => g)
    .sort((a, b) => b.cantidad - a.cantidad || b.total - a.total)

  const { realizadas, restantes } = resumenCoach(datos.paquetes)
  const sesiones = datos.paquetes
    .flatMap((p) => (p.coach_sesiones || []).map((s) => s.fecha))
    .filter((f): f is string => Boolean(f))
    .sort()

  return {
    nombre: datos.nombre.trim(),
    primerNombre: primerNombre(datos.nombre),
    desde: datos.fechaInicioProceso || sesiones[0] || null,
    sesiones,
    tomadas: realizadas,
    porTomar: restantes,
    totalPagado,
    totalFalta,
    pendientes,
    pagadas,
    cuentasPagadas,
  }
}

/** Lee de la base todo lo de una persona. Usa el cliente del servidor (service role). */
export async function leerProcesoPersona(admin: DbClient, asistenteId: string): Promise<ProcesoPersona | null> {
  const [persona, cuentas, paquetes] = await Promise.all([
    admin.from("asistentes").select("nombre, fecha_inicio_proceso").eq("id", asistenteId).maybeSingle(),
    admin
      .from("cuentas_por_cobrar")
      .select("concepto, valor_total, pagos_abonos (monto, estado, notas)")
      .eq("asistente_id", asistenteId),
    admin
      .from("coach_paquetes")
      .select("id, sesiones_compradas, creado_en, coach_sesiones (fecha)")
      .eq("asistente_id", asistenteId),
  ])
  if (persona.error || cuentas.error || paquetes.error) {
    throw new Error("No se pudo leer el proceso de la persona.")
  }
  if (!persona.data) return null

  return armarProceso({
    nombre: persona.data.nombre,
    fechaInicioProceso: persona.data.fecha_inicio_proceso,
    cuentas: cuentas.data || [],
    paquetes: paquetes.data || [],
  })
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

function partes(fechaIso: string) {
  const [anio, mes, dia] = fechaIso.slice(0, 10).split("-").map(Number)
  return { anio, mes, dia }
}

/** "17 de octubre" o, con el año, "3 de marzo de 2026". */
export function fechaLarga(fechaIso: string, conAnio = false): string {
  const { anio, mes, dia } = partes(fechaIso)
  return `${dia} de ${MESES[mes - 1]}${conAnio ? ` de ${anio}` : ""}`
}

/** Lo que va dentro de un sello: el dia grande y el mes corto. */
export function fechaDeSello(fechaIso: string): { dia: string; mes: string } {
  const { mes, dia } = partes(fechaIso)
  return { dia: String(dia), mes: MESES_CORTOS[mes - 1] }
}

/**
 * Numero para wa.me (solo digitos, con indicativo). Los celulares de Colombia
 * de 10 digitos que empiezan por 3 llevan el 57 delante. Null si no sirve.
 */
export function telefonoWhatsApp(telefono: string | null | undefined): string | null {
  const digitos = String(telefono || "").replace(/\D/g, "")
  if (/^3\d{9}$/.test(digitos)) return `57${digitos}`
  if (/^573\d{9}$/.test(digitos)) return digitos
  if (digitos.length >= 11 && digitos.length <= 15) return digitos
  return null
}
