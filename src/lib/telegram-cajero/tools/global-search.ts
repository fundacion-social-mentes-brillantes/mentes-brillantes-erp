import type { SupabaseReader } from "./types"
import { toolResult } from "./types"
import { searchPerson } from "./search-person"

const SIN_RESULTADOS = Promise.resolve({ data: [] as never[], error: null })

export async function searchGlobal(supabase: SupabaseReader, term: string) {
  const queryScope = { term }
  // Sanitiza caracteres que rompen el filtro .or() de PostgREST (comas,
  // paréntesis, comodines) para evitar inyección en el filtro.
  const normalized = (term || "").trim().replace(/[,()*\\%_]/g, " ").replace(/\s+/g, " ").trim()
  if (!/^\d+$/.test(normalized) && normalized.length < 3) {
    return toolResult({
      toolName: "searchGlobal",
      status: "empty",
      queryScope,
      sources: [],
      resultCount: 0,
      data: [],
      explanationHints: ["El termino es muy corto; pide mas detalle salvo codigo exacto."],
    })
  }

  // Las personas se buscan por palabras y sin tildes, igual que en el resto del
  // ERP: "Gloria Fernandez" encuentra a "Gloria Stella Fernández Camelo". Antes
  // se buscaba la frase pegada y no la encontraba.
  const personas = await searchPerson(supabase, normalized, 5)
  const errorPersonas = personas.status === "error"
  const filasPersonas = !errorPersonas && Array.isArray(personas.data) ? personas.data : []
  const ids = filasPersonas.map((p) => p.id).filter(Boolean)
  const hayPersonas = ids.length > 0

  // Pagos, saldo a favor, donaciones y paquetes no tienen texto propio que
  // buscar: se buscan por la persona encontrada. Antes se comparaba el termino
  // contra `metodo_pago`, que en pagos y donaciones es un tipo enumerado y no
  // admite ILIKE: esas dos fuentes fallaban SIEMPRE y la busqueda salia
  // "parcial" en todas las consultas. Y los paquetes se filtraban por el
  // concepto de la cuenta sin `!inner`, lo que no filtraba nada: devolvia los
  // primeros cinco paquetes de la base, fuera lo que fuera lo buscado.
  const [cuentas, pagos, saldoFavor, donaciones, egresos, ventas, coachPaquetes, socios, periodos] = await Promise.all([
    supabase.from("cuentas_por_cobrar").select("id, concepto, asistentes(nombre, codigo)").ilike("concepto", `%${normalized}%`).limit(5),
    hayPersonas
      ? supabase
          .from("pagos_abonos")
          .select("id, monto, metodo_pago, fecha_pago, cuentas_por_cobrar!inner(concepto, asistente_id, asistentes(nombre, codigo))")
          .in("cuentas_por_cobrar.asistente_id", ids)
          .order("fecha_pago", { ascending: false })
          .limit(5)
      : SIN_RESULTADOS,
    hayPersonas
      ? supabase
          .from("movimientos_saldo_favor")
          .select("id, tipo, monto, fecha, metodo_pago, asistentes(nombre, codigo)")
          .in("asistente_id", ids)
          .order("fecha", { ascending: false })
          .limit(5)
      : SIN_RESULTADOS,
    hayPersonas
      ? supabase
          .from("donaciones_asistentes")
          .select("id, monto, metodo_pago, fecha, asistentes(nombre, codigo)")
          .in("asistente_id", ids)
          .order("fecha", { ascending: false })
          .limit(5)
      : SIN_RESULTADOS,
    supabase.from("egresos").select("id, concepto, monto, fecha").ilike("concepto", `%${normalized}%`).limit(5),
    supabase.from("ventas_externas").select("id, comprador_nombre, concepto, monto, fecha").or(`comprador_nombre.ilike.%${normalized}%,concepto.ilike.%${normalized}%`).limit(5),
    hayPersonas
      ? supabase
          .from("coach_paquetes")
          .select("id, sesiones_compradas, creado_en, cuentas_por_cobrar(concepto, asistentes(nombre, codigo))")
          .in("asistente_id", ids)
          .order("creado_en", { ascending: false })
          .limit(5)
      : supabase
          .from("coach_paquetes")
          .select("id, sesiones_compradas, creado_en, cuentas_por_cobrar!inner(concepto, asistentes(nombre, codigo))")
          .ilike("cuentas_por_cobrar.concepto", `%${normalized}%`)
          .limit(5),
    supabase.from("socios").select("id, nombre").ilike("nombre", `%${normalized}%`).limit(5),
    supabase.from("periodos").select("id, nombre, estado").ilike("nombre", `%${normalized}%`).limit(5),
  ])

  const data = {
    // Solo nombre y codigo: la cedula con la que searchPerson desempata no sale de aqui.
    asistentes: filasPersonas.map((p) => ({ id: p.id, nombre: p.nombre, codigo: p.codigo })),
    cuentas: cuentas.error ? [] : cuentas.data || [],
    pagos_abonos: pagos.error ? [] : pagos.data || [],
    movimientos_saldo_favor: saldoFavor.error ? [] : saldoFavor.data || [],
    donaciones_asistentes: donaciones.error ? [] : donaciones.data || [],
    egresos: egresos.error ? [] : egresos.data || [],
    ventas_externas: ventas.error ? [] : ventas.data || [],
    coach_sesiones: [],
    coach_paquetes: coachPaquetes.error ? [] : coachPaquetes.data || [],
    socios: socios.error ? [] : socios.data || [],
    periodos: periodos.error ? [] : periodos.data || [],
  }
  const count = Object.values(data).reduce((acc, rows) => acc + rows.length, 0)
  const failedSources = [
    errorPersonas ? "asistentes" : null,
    cuentas.error ? "cuentas_por_cobrar" : null,
    pagos.error ? "pagos_abonos" : null,
    saldoFavor.error ? "movimientos_saldo_favor" : null,
    donaciones.error ? "donaciones_asistentes" : null,
    egresos.error ? "egresos" : null,
    ventas.error ? "ventas_externas" : null,
    coachPaquetes.error ? "coach_paquetes" : null,
    socios.error ? "socios" : null,
    periodos.error ? "periodos" : null,
  ].filter((source): source is string => Boolean(source))
  const warning = failedSources.length
    ? `La busqueda global quedo parcial porque no se pudieron consultar: ${failedSources.join(", ")}. Los resultados de las demas fuentes si se conservaron.`
    : null

  return toolResult({
    toolName: "searchGlobal",
    status: failedSources.length ? "partial" : count ? "ok" : "empty",
    queryScope,
    sources: [
      "asistentes",
      "cuentas_por_cobrar",
      "pagos_abonos",
      "movimientos_saldo_favor",
      "donaciones_asistentes",
      "egresos",
      "ventas_externas",
      "coach_paquetes",
      "socios",
      "periodos",
    ],
    resultCount: count,
    data,
    explanationHints: [
      ...(warning ? [warning] : []),
      ...(hayPersonas ? ["Pagos, saldo a favor, donaciones y paquetes son los mas recientes de las personas encontradas."] : []),
    ],
    userSafeErrors: warning ? [warning] : [],
  })
}
