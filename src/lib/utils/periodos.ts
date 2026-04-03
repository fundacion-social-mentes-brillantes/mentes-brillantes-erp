type SupabaseLike = any

type PeriodoRecord = {
  id: string
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  estado: string
}

const SELECT_PERIODO = "id, nombre, fecha_inicio, fecha_fin, estado"

export async function getPeriodoByFecha(supabase: SupabaseLike, fecha: string): Promise<PeriodoRecord | null> {
  if (!fecha) return null

  const { data, error } = await supabase
    .from("periodos")
    .select(SELECT_PERIODO)
    .lte("fecha_inicio", fecha)
    .gte("fecha_fin", fecha)
    .order("fecha_inicio", { ascending: false })
    .limit(1)

  if (error) {
    throw new Error("No se pudo validar el período contable.")
  }

  return data?.[0] || null
}

export async function assertFechaEditable(
  supabase: SupabaseLike,
  fecha: string,
  accion: string
): Promise<string | null> {
  const periodo = await getPeriodoByFecha(supabase, fecha)
  if (!periodo || periodo.estado !== "cerrado") return null

  return `${accion} no se puede realizar porque la fecha ${fecha} pertenece al período cerrado ${periodo.nombre}.`
}

export async function assertPeriodoAbierto(
  supabase: SupabaseLike,
  periodoId: string,
  accion: string
): Promise<{ error?: string; periodo?: PeriodoRecord }> {
  const { data: periodo, error } = await supabase
    .from("periodos")
    .select(SELECT_PERIODO)
    .eq("id", periodoId)
    .single()

  if (error || !periodo) {
    return { error: "No se encontró el período contable." }
  }

  if (periodo.estado !== "abierto") {
    return { error: `${accion} no se puede realizar porque el período ${periodo.nombre} está cerrado.` }
  }

  return { periodo }
}

export async function assertNoPeriodOverlap(
  supabase: SupabaseLike,
  fechaInicio: string,
  fechaFin: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("periodos")
    .select("id, nombre, fecha_inicio, fecha_fin")
    .lte("fecha_inicio", fechaFin)
    .gte("fecha_fin", fechaInicio)
    .limit(1)

  if (error) {
    throw new Error("No se pudo validar el solapamiento de períodos.")
  }

  const periodo = data?.[0]
  if (!periodo) return null

  return `El nuevo período se superpone con ${periodo.nombre} (${periodo.fecha_inicio} a ${periodo.fecha_fin}).`
}
