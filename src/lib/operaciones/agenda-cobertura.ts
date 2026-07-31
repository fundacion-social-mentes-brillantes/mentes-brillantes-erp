import { OperacionError } from "./errores"

// Ante una sesión dictada que no está en el ERP hay que hacerse DOS preguntas,
// y se confunden con facilidad:
//
//   1. ¿Le queda cupo? O sea, ¿esa sesión ya venía comprada dentro de un
//      paquete que todavía tiene espacio?
//   2. Ese paquete, ¿está pagado?
//
// Se puede tener cupo en un paquete que aún se debe. Sin separar las dos, el
// aviso de "sesión sin registrar" no alcanza a decir lo único que importa:
// si solo hay que descontarla del paquete, o si además hay que cobrarla.
//
// El cupo se reparte igual que al registrar de verdad: primero el paquete más
// antiguo con espacio (misma regla que paqueteDestino en utils/coach).

export type PaqueteCupo = {
  id: string
  concepto: string | null
  creadoEn: string
  compradas: number
  usadas: number
  /** Lo que falta por pagar de la cuenta de este paquete. */
  pendiente: number
}

export type EstadoCupo = {
  paquetes: PaqueteCupo[]
  /** Deuda sumando TODAS las cuentas de la persona, no solo los paquetes. */
  deudaTotal: number
}

/**
 * Las tres situaciones posibles. Existe para poder agrupar varias sesiones de
 * la misma persona: el texto del resumen lleva dentro el contador de cupo, que
 * baja en cada sesión, así que comparar frases no sirve para agrupar.
 */
export type Situacion = "cupo_pagado" | "cupo_debiendo" | "sin_cupo"

export type Cobertura = {
  situacion: Situacion
  /** La sesión sale de un paquete ya comprado. */
  tieneCupo: boolean
  /** Cupos libres que le quedaban justo antes de esta sesión. */
  cupoAntes: number
  paquete: string | null
  paquetePagado: boolean
  paquetePendiente: number
  deudaTotal: number
  /** Frase corta, lista para el aviso. */
  resumen: string
  /** Qué hacer, ya sabiendo si está pagada o no. */
  accion: string
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`

/** Un pago anulado no cuenta. Se marca por partida doble: estado y nota. */
const esAnulado = (p: any) =>
  String(p?.estado || "").toLowerCase() === "anulado" ||
  String(p?.notas || "").toUpperCase().includes("[ANULADO]")

function pendienteDeCuenta(cuenta: any): number {
  if (!cuenta) return 0
  const pagado = (cuenta.pagos_abonos || [])
    .filter((p: any) => !esAnulado(p))
    .reduce((total: number, p: any) => total + Number(p?.monto || 0), 0)
  return Math.max(0, Number(cuenta.valor_total || 0) - pagado)
}

const primera = (v: any) => (Array.isArray(v) ? v[0] : v)

/** Cupo y deuda de cada persona, en tres consultas para toda la lista. */
export async function cargarEstadoCupo(
  admin: any,
  asistenteIds: string[]
): Promise<Map<string, EstadoCupo>> {
  const ids = Array.from(new Set(asistenteIds.filter(Boolean)))
  const mapa = new Map<string, EstadoCupo>()
  if (!ids.length) return mapa

  const [{ data: paquetes, error: errorPaquetes }, { data: sesiones }, { data: cuentas }] =
    await Promise.all([
      admin
        .from("coach_paquetes")
        .select(
          "id, asistente_id, sesiones_compradas, creado_en, cuentas_por_cobrar(concepto, valor_total, pagos_abonos(monto, estado, notas))"
        )
        .in("asistente_id", ids),
      admin.from("coach_sesiones").select("paquete_id").in("asistente_id", ids),
      admin
        .from("cuentas_por_cobrar")
        .select("asistente_id, valor_total, pagos_abonos(monto, estado, notas)")
        .in("asistente_id", ids),
    ])

  if (errorPaquetes) throw new OperacionError("No se pudieron leer los paquetes coach.")

  const usadasPorPaquete = new Map<string, number>()
  for (const s of sesiones || []) {
    if (!s.paquete_id) continue
    usadasPorPaquete.set(s.paquete_id, (usadasPorPaquete.get(s.paquete_id) || 0) + 1)
  }

  for (const id of ids) mapa.set(id, { paquetes: [], deudaTotal: 0 })

  for (const p of (paquetes || []) as any[]) {
    const estado = mapa.get(p.asistente_id)
    if (!estado) continue
    const cuenta = primera(p.cuentas_por_cobrar)
    estado.paquetes.push({
      id: p.id,
      concepto: cuenta?.concepto ?? null,
      creadoEn: p.creado_en || "",
      compradas: Number(p.sesiones_compradas || 0),
      usadas: usadasPorPaquete.get(p.id) || 0,
      pendiente: pendienteDeCuenta(cuenta),
    })
  }

  for (const c of (cuentas || []) as any[]) {
    const estado = mapa.get(c.asistente_id)
    if (estado) estado.deudaTotal += pendienteDeCuenta(c)
  }

  // Se gasta primero el crédito más viejo, igual que al registrar.
  for (const estado of Array.from(mapa.values())) {
    estado.paquetes.sort((a, b) => (a.creadoEn < b.creadoEn ? -1 : a.creadoEn > b.creadoEn ? 1 : 0))
  }

  return mapa
}

const sesionesLibres = (n: number) => (n === 1 ? "1 sesión libre" : `${n} sesiones libres`)

/**
 * Reparte el cupo disponible entre las sesiones que faltan por registrar.
 *
 * Importa que sea un reparto y no una respuesta por sesión: si alguien tiene 1
 * cupo y 3 sesiones sin registrar, solo la primera queda cubierta. Contestar
 * "sí tiene cupo" tres veces sería mentir dos.
 *
 * `cantidad` debe venir ordenada por fecha ascendente: se cubren primero las
 * más viejas, que es el orden en que se registrarían.
 */
export function repartirCupo(estado: EstadoCupo | undefined, cantidad: number): Cobertura[] {
  const libres = (estado?.paquetes || []).map((p) => ({
    concepto: p.concepto,
    pendiente: p.pendiente,
    espacio: Math.max(0, p.compradas - p.usadas),
  }))
  const deudaTotal = estado?.deudaTotal || 0
  let cupo = libres.reduce((total, p) => total + p.espacio, 0)

  const salida: Cobertura[] = []

  for (let i = 0; i < cantidad; i++) {
    const cupoAntes = cupo
    const destino = libres.find((p) => p.espacio > 0)

    if (!destino) {
      salida.push({
        situacion: "sin_cupo",
        tieneCupo: false,
        cupoAntes,
        paquete: null,
        paquetePagado: false,
        paquetePendiente: 0,
        deudaTotal,
        resumen: deudaTotal > 0
          ? `sin cupo — no tiene sesiones compradas sin usar y ya debe ${pesos(deudaTotal)}`
          : "sin cupo — no tiene sesiones compradas sin usar",
        accion: "Registrar la sesión y crear su cobro: esta no está comprada.",
      })
      continue
    }

    destino.espacio -= 1
    cupo -= 1

    const nombrePaquete = destino.concepto ? `«${destino.concepto}»` : "su paquete"

    if (destino.pendiente <= 0) {
      salida.push({
        situacion: "cupo_pagado",
        tieneCupo: true,
        cupoAntes,
        paquete: destino.concepto,
        paquetePagado: true,
        paquetePendiente: 0,
        deudaTotal,
        resumen: `con cupo pagado — le quedaban ${sesionesLibres(cupoAntes)} en ${nombrePaquete}`,
        accion: "Registrar la sesión: se descuenta del paquete y no hay nada que cobrar.",
      })
      continue
    }

    salida.push({
      situacion: "cupo_debiendo",
      tieneCupo: true,
      cupoAntes,
      paquete: destino.concepto,
      paquetePagado: false,
      paquetePendiente: destino.pendiente,
      deudaTotal,
      resumen: `con cupo, pero el paquete está a medio pagar — le quedaban ${sesionesLibres(cupoAntes)} en ${nombrePaquete}, que aún debe ${pesos(destino.pendiente)}`,
      accion: "Registrar la sesión (sale del paquete), pero ese paquete todavía se debe.",
    })
  }

  return salida
}
