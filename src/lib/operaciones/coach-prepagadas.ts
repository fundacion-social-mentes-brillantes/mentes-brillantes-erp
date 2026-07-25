import { OperacionError } from "./errores"

// Sesiones coach pagadas que llevan mucho sin marcarse como dictadas.
//
// Salio al registrar pagos reales: varias personas tenian un cupo prepagado de
// hace meses, asi que al registrarles una sesion nueva esta consumia el cupo
// viejo (el sistema gasta primero el credito mas antiguo, como debe ser) y el
// paquete recien comprado quedaba libre. Cuadra en dinero, pero significa una
// de dos cosas: o de verdad tienen una sesion pendiente de tomar, o esa sesion
// se dicto y nunca se registro.
//
// Solo informa. No corrige nada: quien sabe si la sesion se dicto es la persona.

const DIAS_SOSPECHA = 60

export type PrepagadaSinUsar = {
  codigo: string | null
  nombre: string
  compradoEl: string
  diasSinUsar: number
  concepto: string | null
  sesionesCompradas: number
  sesionesUsadas: number
  sinUsar: number
  pagado: number
  /** Un paquete grande a medio consumir es normal; una sesion suelta no. */
  sospechoso: boolean
}

export async function buscarPrepagadasSinUsar(
  admin: any,
  opciones: { diasMinimos?: number; soloSospechosas?: boolean } = {}
): Promise<PrepagadaSinUsar[]> {
  const dias = Math.max(1, Math.floor(opciones.diasMinimos ?? DIAS_SOSPECHA))

  const { data, error } = await admin
    .from("coach_paquetes")
    .select(
      "id, sesiones_compradas, asistentes(codigo, nombre), cuentas_por_cobrar(concepto, valor_total, fecha_emision, pagos_abonos(monto, estado, notas))"
    )

  if (error) throw new OperacionError("No se pudieron leer los paquetes coach.")

  const paquetes = data || []
  if (!paquetes.length) return []

  // Sesiones usadas por paquete, en una sola consulta.
  const { data: sesiones } = await admin.from("coach_sesiones").select("paquete_id")
  const usadasPorPaquete = new Map<string, number>()
  for (const s of sesiones || []) {
    if (!s.paquete_id) continue
    usadasPorPaquete.set(s.paquete_id, (usadasPorPaquete.get(s.paquete_id) || 0) + 1)
  }

  const hoy = new Date()
  const resultado: PrepagadaSinUsar[] = []

  for (const paquete of paquetes as any[]) {
    const cuenta = Array.isArray(paquete.cuentas_por_cobrar)
      ? paquete.cuentas_por_cobrar[0]
      : paquete.cuentas_por_cobrar
    if (!cuenta?.fecha_emision) continue

    // Un anulado no cuenta como pago (doble marca: estado y nota).
    const pagado = (cuenta.pagos_abonos || [])
      .filter((p: any) => {
        const anulado =
          String(p?.estado || "").toLowerCase() === "anulado" ||
          String(p?.notas || "").toUpperCase().includes("[ANULADO]")
        return !anulado
      })
      .reduce((total: number, p: any) => total + Number(p?.monto || 0), 0)

    if (pagado <= 0) continue

    const compradas = Number(paquete.sesiones_compradas || 0)
    const usadas = usadasPorPaquete.get(paquete.id) || 0
    const sinUsar = compradas - usadas
    if (sinUsar <= 0) continue

    const diasSinUsar = Math.floor(
      (hoy.getTime() - new Date(`${cuenta.fecha_emision}T00:00:00Z`).getTime()) / 86400000
    )
    if (diasSinUsar < dias) continue

    const persona = Array.isArray(paquete.asistentes) ? paquete.asistentes[0] : paquete.asistentes

    // Sospechoso = paquete de 1 sola sesion pagado y nunca usado. Un paquete de
    // 24 a medio consumir es lo normal y no deberia alarmar.
    const sospechoso = compradas === 1 && usadas === 0

    resultado.push({
      codigo: persona?.codigo ?? null,
      nombre: persona?.nombre || "(sin nombre)",
      compradoEl: cuenta.fecha_emision,
      diasSinUsar,
      concepto: cuenta.concepto ?? null,
      sesionesCompradas: compradas,
      sesionesUsadas: usadas,
      sinUsar,
      pagado,
      sospechoso,
    })
  }

  const filtrado = opciones.soloSospechosas ? resultado.filter((r) => r.sospechoso) : resultado
  return filtrado.sort((a, b) => b.diasSinUsar - a.diasSinUsar)
}
