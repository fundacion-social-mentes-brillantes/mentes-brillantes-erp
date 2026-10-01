import { assertFechaEditable } from "@/lib/utils/periodos"
import { OperacionError, exigir, exigirFechaIso, exigirMontoPositivo } from "./errores"
import { registrarAbono, type ActorErp, type ResultadoAbono } from "./abonos"
import { registrarSesionCoach } from "./coach"

// Nucleo compartido de los movimientos "de creacion": egresos, ventas
// externas, donaciones y anticipos (saldo a favor).
//
// Igual que en abonos.ts, vive aparte para que la web y el MCP escriban con
// las MISMAS reglas: validar el monto, respetar el periodo contable cerrado y
// dejar siempre rastro en auditoria_financiera con el usuario real.
//
// No hace autenticacion: cada canal decide quien puede llamar (requireAdmin /
// requireRoles en la web, el gate de rol del MCP).

export const CATEGORIAS_EGRESO = [
  "Operativo",
  "Administrativo",
  "Insumos",
  "Servicios",
  "Honorarios",
  "Otros",
] as const

export const METODOS_PAGO = ["efectivo", "nequi", "daviplata", "otro"] as const

/**
 * OJO: `auditoria_financiera.motivo` es NOT NULL. Pasar null (lo que ocurria
 * cuando el movimiento no traia notas) hacia fallar el insert en silencio, y
 * el movimiento quedaba SIN rastro. Por eso aqui el motivo siempre tiene un
 * texto por defecto y, si aun asi falla, se registra el error en el log en vez
 * de perderse.
 */
async function auditar(
  supabase: any,
  tabla: string,
  registroId: string,
  actor: ActorErp,
  accion: string,
  valorNuevo: number,
  motivo: string | null | undefined,
  motivoPorDefecto: string
) {
  const { error } = await supabase.from("auditoria_financiera").insert([
    {
      tabla_afectada: tabla,
      registro_id: registroId,
      usuario_id: actor.userId || "",
      accion,
      valor_anterior: null,
      valor_nuevo: valorNuevo,
      motivo: (motivo && motivo.trim()) || motivoPorDefecto,
    },
  ])

  if (error) {
    console.error("[operaciones] no se pudo auditar", { tabla, accion, registroId, code: error.code })
  }
}

async function exigirPeriodoAbierto(supabase: any, fecha: string, accion: string) {
  const error = await assertFechaEditable(supabase, fecha, accion)
  if (error) throw new OperacionError(error)
}

// ---------------------------------------------------------------- egresos

export type CrearEgresoParams = {
  concepto: string
  monto: number
  categoria: string
  metodoPago: string
  fecha: string
  notas?: string | null
}

export async function crearEgreso(supabase: any, actor: ActorErp, params: CrearEgresoParams) {
  const concepto = String(params.concepto || "").trim()
  exigir(concepto, "El concepto del egreso es obligatorio.")
  const monto = exigirMontoPositivo(params.monto)
  const fecha = exigirFechaIso(params.fecha)
  // Ojo: no se valida la categoria contra una lista cerrada. El ERP acepta
  // historicamente valores libres (hay egresos con "operativo" en minuscula) y
  // restringirlo aqui rechazaria altas que hoy funcionan desde la web. La
  // lista cerrada se aplica en el esquema del MCP, que si controla su entrada.
  exigir(String(params.categoria || "").trim(), "La categoria es obligatoria.")
  exigir(String(params.metodoPago || "").trim(), "El metodo de pago es obligatorio.")

  await exigirPeriodoAbierto(supabase, fecha, "Crear el egreso")

  const notas = params.notas ? String(params.notas).trim() || null : null
  const { data, error } = await supabase
    .from("egresos")
    .insert([
      {
        concepto,
        monto,
        categoria: params.categoria,
        metodo_pago: params.metodoPago,
        fecha,
        notas,
        usuario_id: actor.userId || null,
      },
    ])
    .select("id")
    .single()

  if (error || !data) throw new OperacionError(error?.message || "No se pudo registrar el egreso.")

  await auditar(supabase, "egresos", data.id, actor, "crear_egreso", monto, notas, "Creación de egreso")
  return { id: data.id as string, monto, concepto, fecha }
}

// --------------------------------------------------------- ventas externas

export type CrearVentaExternaParams = {
  concepto: string
  compradorNombre?: string | null
  monto: number
  metodoPago: string
  fecha: string
  notas?: string | null
}

export async function crearVentaExterna(supabase: any, actor: ActorErp, params: CrearVentaExternaParams) {
  const concepto = String(params.concepto || "").trim()
  exigir(concepto, "El concepto de la venta es obligatorio.")
  const monto = exigirMontoPositivo(params.monto)
  const fecha = exigirFechaIso(params.fecha)
  exigir(String(params.metodoPago || "").trim(), "El metodo de pago es obligatorio.")

  await exigirPeriodoAbierto(supabase, fecha, "Crear la venta externa")

  const notas = params.notas ? String(params.notas).trim() || null : null
  const comprador = params.compradorNombre ? String(params.compradorNombre).trim() || null : null

  const { data, error } = await supabase
    .from("ventas_externas")
    .insert([
      {
        concepto,
        comprador_nombre: comprador,
        monto,
        metodo_pago: params.metodoPago,
        fecha,
        notas,
        usuario_id: actor.userId || null,
      },
    ])
    .select("id")
    .single()

  if (error || !data) throw new OperacionError(error?.message || "No se pudo registrar la venta externa.")

  await auditar(supabase, "ventas_externas", data.id, actor, "crear_venta_externa", monto, notas, "Creación de venta externa")
  return { id: data.id as string, monto, concepto, fecha, compradorNombre: comprador }
}

// -------------------------------------------------------------- donaciones

export type CrearDonacionParams = {
  asistenteId: string
  monto: number
  metodoPago: string
  fecha: string
  notas?: string | null
}

export async function crearDonacion(supabase: any, actor: ActorErp, params: CrearDonacionParams) {
  exigir(params.asistenteId, "Falta la persona que dona.")
  const monto = exigirMontoPositivo(params.monto)
  const fecha = exigirFechaIso(params.fecha)
  exigir(String(params.metodoPago || "").trim(), "El metodo de pago es obligatorio.")

  await exigirPeriodoAbierto(supabase, fecha, "Crear la donación")

  const notas = params.notas ? String(params.notas).trim() || null : null
  const { data, error } = await supabase
    .from("donaciones_asistentes")
    .insert([
      {
        asistente_id: params.asistenteId,
        monto,
        metodo_pago: params.metodoPago,
        fecha,
        notas,
        usuario_id: actor.userId || null,
      },
    ])
    .select("id")
    .single()

  if (error || !data) throw new OperacionError(error?.message || "No se pudo registrar la donación.")

  await auditar(supabase, "donaciones_asistentes", data.id, actor, "crear_donacion", monto, notas, "Registro de donación")
  return { id: data.id as string, monto, fecha }
}

// ----------------------------------------------------------------- cuentas

/**
 * Como se cobra una cuenta. "normal" es lo de siempre. Las otras dos existen
 * solo para paquetes coach y van en valor 0: la persona recibe las sesiones
 * pero no le entra deuda (cortesia, o lo paga otro proceso/familiar). Son las
 * mismas modalidades del formulario de la web.
 */
export const MODALIDADES_COBRO = ["normal", "cortesia", "cubierto_por_otro_proceso"] as const
export type ModalidadCobro = (typeof MODALIDADES_COBRO)[number]

const PREFIJO_MODALIDAD: Record<Exclude<ModalidadCobro, "normal">, string> = {
  cortesia: "[Cortesia]",
  cubierto_por_otro_proceso: "[Cubierto por otro proceso/familiar]",
}

/** El concepto con la marca de su modalidad, igual que la web (sin duplicarla). */
export function conceptoConModalidad(concepto: string, modalidad: ModalidadCobro): string {
  if (modalidad === "normal") return concepto
  const prefijo = PREFIJO_MODALIDAD[modalidad]
  if (concepto.toLowerCase().includes(prefijo.toLowerCase())) return concepto
  return `${prefijo} ${concepto}`
}

export type CrearCuentaParams = {
  asistenteId: string
  concepto: string
  valorTotal: number
  fechaEmision: string
  /**
   * Si se indica, la cuenta es un paquete coach y se crea tambien su
   * `coach_paquetes` con ese numero de sesiones. Sin el paquete no habria
   * contra que descontar las sesiones dictadas, que es justo lo que hace la
   * web al marcar la cuenta como tipo coach.
   */
  sesionesCoach?: number | null
  /** Por defecto "normal". */
  modalidad?: ModalidadCobro | null
}

/**
 * Valida una cuenta nueva con las reglas del formulario de la web y devuelve
 * los valores ya normalizados. No escribe nada: lo usan tanto el borrador como
 * la ejecucion, para que lo que se muestra sea exactamente lo que se guarda.
 */
export function validarCuentaNueva(params: CrearCuentaParams) {
  exigir(params.asistenteId, "Falta la persona a la que se le cobra.")
  const conceptoBase = String(params.concepto || "").trim()
  exigir(conceptoBase, "El concepto es obligatorio.")
  const fechaEmision = exigirFechaIso(params.fechaEmision)

  const modalidad: ModalidadCobro =
    params.modalidad && MODALIDADES_COBRO.includes(params.modalidad) ? params.modalidad : "normal"
  const sesiones = Number(params.sesionesCoach || 0)
  const esPaqueteCoach = sesiones > 0
  const valor = Number(params.valorTotal)

  if (!Number.isFinite(valor) || valor < 0) throw new OperacionError("El valor de la cuenta no puede ser negativo.")
  if (modalidad !== "normal" && !esPaqueteCoach) {
    throw new OperacionError(
      "La cortesia y lo cubierto por otro proceso solo aplican a paquetes coach: indica cuantas sesiones incluye."
    )
  }
  if (modalidad !== "normal" && valor > 0) {
    throw new OperacionError("Una cortesia o un paquete cubierto por otro proceso se registra con valor 0.")
  }

  const valorTotal = modalidad === "normal" ? exigirMontoPositivo(valor, "El valor de la cuenta") : 0
  const concepto = valorTotal === 0 ? conceptoConModalidad(conceptoBase, modalidad) : conceptoBase

  return {
    asistenteId: params.asistenteId,
    concepto,
    valorTotal,
    fechaEmision,
    sesiones,
    modalidad,
    // Una cuenta en 0 no tiene nada que cobrar: nace pagada, como en la web.
    estadoInicial: valorTotal === 0 ? "pagado" : "pendiente",
  }
}

/**
 * Crea una cuenta por cobrar (un concepto con su valor), y su paquete coach si
 * lleva sesiones. Para crearla ya con abono o con la primera sesion dictada,
 * ver crearCuentaCompleta.
 */
export async function crearCuenta(supabase: any, actor: ActorErp, params: CrearCuentaParams) {
  const v = validarCuentaNueva(params)

  await exigirPeriodoAbierto(supabase, v.fechaEmision, "Crear la cuenta")

  const { data, error } = await supabase
    .from("cuentas_por_cobrar")
    .insert([
      {
        asistente_id: v.asistenteId,
        concepto: v.concepto,
        valor_total: v.valorTotal,
        fecha_emision: v.fechaEmision,
        estado: v.estadoInicial,
      },
    ])
    .select("id")
    .single()

  if (error || !data) throw new OperacionError(error?.message || "No se pudo crear la cuenta.")

  let paqueteId: string | null = null
  if (v.sesiones > 0) {
    const { data: paquete, error: errorPaquete } = await supabase
      .from("coach_paquetes")
      .insert([{ asistente_id: v.asistenteId, cuenta_id: data.id, sesiones_compradas: v.sesiones }])
      .select("id")
      .single()

    if (errorPaquete || !paquete) {
      // Sin paquete la cuenta coach queda coja: se deshace para no dejarla a medias.
      await supabase.from("cuentas_por_cobrar").delete().eq("id", data.id)
      throw new OperacionError(errorPaquete?.message || "No se pudo crear el paquete coach asociado.")
    }
    paqueteId = paquete.id
  }

  await auditar(supabase, "cuentas_por_cobrar", data.id, actor, "crear_cuenta", v.valorTotal, v.concepto, "Creación de cuenta")
  return {
    id: data.id as string,
    concepto: v.concepto,
    valorTotal: v.valorTotal,
    fechaEmision: v.fechaEmision,
    paqueteId,
    sesionesCoach: v.sesiones || null,
    modalidad: v.modalidad,
    estado: v.estadoInicial,
  }
}

export type AbonoInicialParams = {
  monto: number
  metodoPago: string
  fechaPago: string
  notas?: string | null
}

export type PrimeraSesionParams = {
  fecha: string
  notas?: string | null
  eventoAgendaId?: string | null
}

export type CrearCuentaCompletaParams = CrearCuentaParams & {
  abonoInicial?: AbonoInicialParams | null
  primeraSesion?: PrimeraSesionParams | null
}

/**
 * Valida el abono inicial y la primera sesion de una cuenta nueva. Va aparte
 * de crear para que el borrador pueda rechazar antes de escribir nada.
 */
export async function validarCuentaCompleta(supabase: any, params: CrearCuentaCompletaParams) {
  const cuenta = validarCuentaNueva(params)
  await exigirPeriodoAbierto(supabase, cuenta.fechaEmision, "Crear la cuenta")

  let abono: (AbonoInicialParams & { montoAplicado: number; excedente: number }) | null = null
  if (params.abonoInicial) {
    if (cuenta.valorTotal === 0) {
      throw new OperacionError("No se puede registrar un abono inicial en una cuenta de valor 0.")
    }
    const monto = exigirMontoPositivo(params.abonoInicial.monto, "El abono inicial")
    const metodoPago = String(params.abonoInicial.metodoPago || "").trim()
    exigir(metodoPago, "Indica el metodo de pago del abono inicial.")
    const fechaPago = exigirFechaIso(params.abonoInicial.fechaPago, "La fecha del abono inicial")
    await exigirPeriodoAbierto(supabase, fechaPago, "Registrar el abono inicial")
    const montoAplicado = Math.min(monto, cuenta.valorTotal)
    abono = {
      monto,
      metodoPago,
      fechaPago,
      notas: params.abonoInicial.notas ?? null,
      montoAplicado,
      excedente: Math.max(0, monto - montoAplicado),
    }
  }

  let sesion: PrimeraSesionParams | null = null
  if (params.primeraSesion) {
    if (cuenta.sesiones <= 0) {
      throw new OperacionError("Solo un paquete coach puede llevar sesion: indica cuantas sesiones incluye.")
    }
    sesion = {
      fecha: exigirFechaIso(params.primeraSesion.fecha, "La fecha de la sesion"),
      notas: params.primeraSesion.notas ?? null,
      eventoAgendaId: params.primeraSesion.eventoAgendaId ?? null,
    }
  }

  const pendienteDespues = Math.max(0, cuenta.valorTotal - (abono?.montoAplicado ?? 0))
  const estadoDespues = pendienteDespues <= 0 ? "pagado" : abono ? "parcial" : "pendiente"

  return { cuenta, abono, sesion, pendienteDespues, estadoDespues }
}

/**
 * Lo mismo que el formulario completo de la web: crea la cuenta (y su paquete
 * coach), y en el mismo paso le registra el abono inicial y/o la primera
 * sesion. El abono pasa por registrarAbono (sobrepago a saldo a favor,
 * recalculo del estado, auditoria) y la sesion cae en el paquete NUEVO, no en
 * el credito mas antiguo de la persona.
 *
 * Si algo falla a mitad de camino se deshace lo ya creado, para no dejar una
 * cuenta cobrada sin su pago o un paquete sin su sesion.
 */
export async function crearCuentaCompleta(supabase: any, actor: ActorErp, params: CrearCuentaCompletaParams) {
  const plan = await validarCuentaCompleta(supabase, params)
  const cuenta = await crearCuenta(supabase, actor, params)

  let abono: ResultadoAbono | null = null
  let sesion: Awaited<ReturnType<typeof registrarSesionCoach>> | null = null
  try {
    if (plan.abono) {
      abono = await registrarAbono(supabase, actor, {
        cuentaId: cuenta.id,
        monto: plan.abono.monto,
        metodoPago: plan.abono.metodoPago,
        fechaPago: plan.abono.fechaPago,
        notas: plan.abono.notas ?? null,
      })
    }
    if (plan.sesion && cuenta.paqueteId) {
      sesion = await registrarSesionCoach(supabase, actor, {
        asistenteId: params.asistenteId,
        fecha: plan.sesion.fecha,
        notas: plan.sesion.notas ?? null,
        eventoAgendaId: plan.sesion.eventoAgendaId ?? null,
        paqueteId: cuenta.paqueteId,
      })
    }
  } catch (error) {
    if (abono?.saldoFavorId) await supabase.from("movimientos_saldo_favor").delete().eq("id", abono.saldoFavorId)
    if (abono?.pagoId) await supabase.from("pagos_abonos").delete().eq("id", abono.pagoId)
    if (cuenta.paqueteId) await supabase.from("coach_paquetes").delete().eq("id", cuenta.paqueteId)
    await supabase.from("cuentas_por_cobrar").delete().eq("id", cuenta.id)
    throw error
  }

  return { ...cuenta, estado: abono?.estadoDespues ?? cuenta.estado, abono, sesion }
}

// --------------------------------------------------------------- anticipos

export type CrearAnticipoParams = {
  asistenteId: string
  monto: number
  metodoPago: string
  fecha: string
  notas?: string | null
}

/**
 * Anticipo = dinero que la persona entrega por adelantado y queda como saldo a
 * favor suyo, para aplicarlo despues a sus cuentas.
 */
export async function crearAnticipo(supabase: any, actor: ActorErp, params: CrearAnticipoParams) {
  exigir(params.asistenteId, "Falta la persona del anticipo.")
  const monto = exigirMontoPositivo(params.monto)
  const fecha = exigirFechaIso(params.fecha)
  exigir(String(params.metodoPago || "").trim(), "El metodo de pago es obligatorio.")

  await exigirPeriodoAbierto(supabase, fecha, "Registrar el anticipo")

  const notas = params.notas ? String(params.notas).trim() || null : null
  const { data, error } = await supabase
    .from("movimientos_saldo_favor")
    .insert([
      {
        asistente_id: params.asistenteId,
        tipo: "ingreso",
        monto,
        fecha,
        metodo_pago: params.metodoPago,
        notas,
        usuario_id: actor.userId || null,
      },
    ])
    .select("id")
    .single()

  if (error || !data) throw new OperacionError(error?.message || "No se pudo registrar el anticipo.")

  await auditar(
    supabase,
    "movimientos_saldo_favor",
    data.id,
    actor,
    "crear_anticipo",
    monto,
    notas,
    "Registro de anticipo"
  )
  return { id: data.id as string, monto, fecha }
}
