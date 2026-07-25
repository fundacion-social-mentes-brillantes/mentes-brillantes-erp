import { assertFechaEditable } from "@/lib/utils/periodos"
import { OperacionError, exigir, exigirFechaIso, exigirMontoPositivo } from "./errores"
import type { ActorErp } from "./abonos"

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

export type CrearCuentaParams = {
  asistenteId: string
  concepto: string
  valorTotal: number
  fechaEmision: string
}

/**
 * Crea una cuenta por cobrar simple (un concepto con su valor). Las variantes
 * ricas de la web —paquetes coach, cortesias y abono inicial en el mismo
 * formulario— siguen viviendo en saveCuenta; aqui se cubre el caso corriente
 * para poder cobrar algo nuevo y luego registrarle pagos.
 */
export async function crearCuenta(supabase: any, actor: ActorErp, params: CrearCuentaParams) {
  exigir(params.asistenteId, "Falta la persona a la que se le cobra.")
  const concepto = String(params.concepto || "").trim()
  exigir(concepto, "El concepto es obligatorio.")
  const valorTotal = exigirMontoPositivo(params.valorTotal, "El valor de la cuenta")
  const fechaEmision = exigirFechaIso(params.fechaEmision)

  await exigirPeriodoAbierto(supabase, fechaEmision, "Crear la cuenta")

  const { data, error } = await supabase
    .from("cuentas_por_cobrar")
    .insert([
      {
        asistente_id: params.asistenteId,
        concepto,
        valor_total: valorTotal,
        fecha_emision: fechaEmision,
        estado: "pendiente",
      },
    ])
    .select("id")
    .single()

  if (error || !data) throw new OperacionError(error?.message || "No se pudo crear la cuenta.")

  await auditar(supabase, "cuentas_por_cobrar", data.id, actor, "crear_cuenta", valorTotal, concepto, "Creación de cuenta")
  return { id: data.id as string, concepto, valorTotal, fechaEmision }
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
