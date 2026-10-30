'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin, requireRoles } from '@/lib/utils/authz'
import { parseMoneyInput } from '@/lib/utils/contable'
import { fechaHoyBogota } from '@/lib/utils/fechas'
import { errorDeAccion } from '@/lib/utils/acciones'
import { anularMovimiento } from '@/lib/operaciones/anulaciones'
import {
  cambiarEstadoTaller,
  cancelarInscripcion,
  codigoDeBoleta,
  crearTaller,
  editarInscripcion,
  editarTaller,
  eliminarTaller,
  inscribirEnTaller,
  marcarAsistencia,
  registrarGastoTaller,
  registrarLlegadaPorCodigo,
  registrarPagoTaller,
  type DatosTaller,
  type LlegadaRegistrada,
} from '@/lib/operaciones/talleres'

// Talleres. Todo pasa por lib/operaciones/talleres.ts, que guarda la plata
// como ventas externas y egresos marcados con el taller.
//
// Permisos: el admin crea y cambia talleres, registra gastos y anula; admin y
// caja inscriben, cobran y marcan quien llego (lo de la puerta el dia del taller).

export type TallerState = { error?: string; success?: boolean; mensaje?: string } | null

const RUTAS_DINERO = ['/ventas-externas', '/egresos', '/movimientos', '/dashboard', '/liquidaciones', '/']

function revalidarTaller(tallerId?: string, conDinero = false) {
  revalidatePath('/talleres')
  if (tallerId) revalidatePath(`/talleres/${tallerId}`)
  if (conDinero) RUTAS_DINERO.forEach((ruta) => revalidatePath(ruta))
}

const texto = (formData: FormData, campo: string) => {
  const valor = formData.get(campo)
  return typeof valor === 'string' ? valor.trim() : ''
}

async function actorConRol(roles: Array<'admin' | 'caja'>) {
  const { supabase, user, perfil } = await requireRoles(roles)
  return { supabase, actor: { userId: user.id, role: perfil.rol === 'admin' ? ('admin' as const) : ('caja' as const) } }
}

function leerTaller(formData: FormData): DatosTaller {
  let preguntas: unknown = []
  try {
    preguntas = JSON.parse(texto(formData, 'preguntas') || '[]')
  } catch {
    preguntas = null
  }
  return {
    nombre: texto(formData, 'nombre'),
    slug: texto(formData, 'slug') || null,
    tipo: texto(formData, 'tipo') || null,
    descripcion: texto(formData, 'descripcion') || null,
    fechaInicio: texto(formData, 'fecha_inicio') || null,
    lugar: texto(formData, 'lugar') || null,
    precio: parseMoneyInput(formData.get('precio')) ?? 0,
    cupo: texto(formData, 'cupo') || null,
    estado: texto(formData, 'estado') || null,
    instruccionesPago: texto(formData, 'instrucciones_pago') || null,
    preguntas,
  }
}

export async function crearTallerAction(_prev: TallerState, formData: FormData): Promise<TallerState> {
  let id: string
  try {
    const { supabase, user } = await requireAdmin()
    const creado = await crearTaller(supabase, { userId: user.id, role: 'admin' }, leerTaller(formData))
    id = creado.id
  } catch (e) {
    return errorDeAccion(e, 'No se pudo crear el taller.', 'talleres')
  }
  revalidarTaller()
  redirect(`/talleres/${id}`)
}

export async function editarTallerAction(tallerId: string, _prev: TallerState, formData: FormData): Promise<TallerState> {
  try {
    const { supabase, user } = await requireAdmin()
    await editarTaller(supabase, { userId: user.id, role: 'admin' }, tallerId, leerTaller(formData))
  } catch (e) {
    return errorDeAccion(e, 'No se pudo guardar el taller.', 'talleres')
  }
  revalidarTaller(tallerId)
  redirect(`/talleres/${tallerId}`)
}

export async function cambiarEstadoTallerAction(tallerId: string, estado: string): Promise<TallerState> {
  try {
    const { supabase } = await requireAdmin()
    await cambiarEstadoTaller(supabase, tallerId, estado)
  } catch (e) {
    return errorDeAccion(e, 'No se pudo cambiar el estado del taller.', 'talleres')
  }
  revalidarTaller(tallerId)
  return { success: true }
}

export async function eliminarTallerAction(tallerId: string): Promise<TallerState> {
  try {
    const { supabase, user } = await requireAdmin()
    await eliminarTaller(supabase, { userId: user.id, role: 'admin' }, tallerId)
  } catch (e) {
    return errorDeAccion(e, 'No se pudo borrar el taller.', 'talleres')
  }
  revalidarTaller()
  redirect('/talleres')
}

/**
 * Inscribe a alguien desde el ERP (antes del taller, o en la puerta). Si trae
 * un pago, lo registra en el mismo paso; si ese pago falla, la inscripcion
 * queda hecha y se dice que falta el pago.
 */
export async function inscribirAction(tallerId: string, _prev: TallerState, formData: FormData): Promise<TallerState> {
  const respuestas: Record<string, string> = {}
  for (const [clave, valor] of formData.entries()) {
    if (clave.startsWith('respuesta_') && typeof valor === 'string') respuestas[clave.slice('respuesta_'.length)] = valor
  }
  const origen = texto(formData, 'origen') === 'puerta' ? 'puerta' : 'manual'
  const valorTexto = texto(formData, 'valor_acordado')
  const montoPago = parseMoneyInput(formData.get('pago_monto'))

  let inscripcionId: string
  try {
    const { supabase, actor } = await actorConRol(['admin', 'caja'])
    const inscrita = await inscribirEnTaller(supabase, actor, {
      tallerId,
      nombre: texto(formData, 'nombre'),
      documento: texto(formData, 'documento') || null,
      telefono: texto(formData, 'telefono') || null,
      correo: texto(formData, 'correo') || null,
      respuestas,
      // Un descuento o una cortesia los decide el admin; caja cobra el valor del taller.
      valorAcordado: valorTexto && actor.role === 'admin' ? parseMoneyInput(valorTexto) : null,
      asistenteId: texto(formData, 'asistente_id') || null,
      origen,
      asistio: origen === 'puerta' || formData.get('asistio') === 'on',
      notas: texto(formData, 'notas') || null,
    })
    inscripcionId = inscrita.id

    if (montoPago && montoPago > 0) {
      try {
        await registrarPagoTaller(supabase, actor, {
          inscripcionId,
          monto: montoPago,
          metodoPago: texto(formData, 'pago_metodo') || 'efectivo',
          fecha: texto(formData, 'pago_fecha') || fechaHoyBogota(),
        })
      } catch (e) {
        revalidarTaller(tallerId)
        const { error } = errorDeAccion(e, 'No se pudo registrar el pago.', 'talleres')
        return { success: true, mensaje: `La inscripción quedó guardada, pero el pago no se registró: ${error}` }
      }
      revalidarTaller(tallerId, true)
      return { success: true, mensaje: 'Inscripción guardada, con su pago registrado.' }
    }
  } catch (e) {
    return errorDeAccion(e, 'No se pudo inscribir.', 'talleres')
  }
  revalidarTaller(tallerId)
  return { success: true, mensaje: 'Inscripción guardada.' }
}

export async function registrarPagoTallerAction(
  tallerId: string,
  inscripcionId: string,
  _prev: TallerState,
  formData: FormData
): Promise<TallerState> {
  try {
    const { supabase, actor } = await actorConRol(['admin', 'caja'])
    await registrarPagoTaller(supabase, actor, {
      inscripcionId,
      monto: parseMoneyInput(formData.get('monto')) ?? 0,
      metodoPago: texto(formData, 'metodo_pago'),
      fecha: texto(formData, 'fecha') || fechaHoyBogota(),
      notas: texto(formData, 'notas') || null,
    })
  } catch (e) {
    return errorDeAccion(e, 'No se pudo registrar el pago.', 'talleres')
  }
  revalidarTaller(tallerId, true)
  return { success: true, mensaje: 'Pago registrado.' }
}

export async function marcarAsistenciaAction(tallerId: string, inscripcionId: string, asistio: boolean): Promise<TallerState> {
  try {
    const { supabase } = await actorConRol(['admin', 'caja'])
    await marcarAsistencia(supabase, inscripcionId, asistio)
  } catch (e) {
    return errorDeAccion(e, 'No se pudo marcar la llegada.', 'talleres')
  }
  revalidarTaller(tallerId)
  return { success: true }
}

export type LlegadaQrState = { error?: string; llegada?: LlegadaRegistrada }

/**
 * La llegada de quien muestra el QR de su boleta: desde el lector de la puerta
 * (con `tallerId`, solo vale una entrada de ese taller) o desde la pagina que
 * abre la camara normal del celular al leer el QR (sin taller).
 */
export async function registrarLlegadaQrAction(tallerId: string | null, leido: string): Promise<LlegadaQrState> {
  let llegada: LlegadaRegistrada
  try {
    const { supabase } = await actorConRol(['admin', 'caja'])
    const codigo = codigoDeBoleta(leido)
    if (!codigo) return { error: 'Ese QR no es una entrada de un taller.' }
    llegada = await registrarLlegadaPorCodigo(supabase, codigo, { tallerId })
  } catch (e) {
    return errorDeAccion(e, 'No se pudo registrar la llegada.', 'talleres')
  }
  if (!llegada.yaHabiaLlegado) revalidarTaller(llegada.tallerId)
  return { llegada }
}

export async function editarInscripcionAction(
  tallerId: string,
  inscripcionId: string,
  _prev: TallerState,
  formData: FormData
): Promise<TallerState> {
  try {
    const { supabase, actor } = await actorConRol(['admin', 'caja'])
    const valorTexto = texto(formData, 'valor_acordado')
    // Cambiar lo que alguien debe pagar es decision del admin.
    if (valorTexto && actor.role !== 'admin') {
      const { data } = await supabase.from('taller_inscripciones').select('valor_acordado').eq('id', inscripcionId).maybeSingle()
      if (data && Number(data.valor_acordado) !== parseMoneyInput(valorTexto)) {
        return { error: 'Solo el administrador puede cambiar el valor a pagar.' }
      }
    }
    await editarInscripcion(supabase, actor, inscripcionId, {
      nombre: texto(formData, 'nombre'),
      documento: texto(formData, 'documento') || null,
      telefono: texto(formData, 'telefono') || null,
      correo: texto(formData, 'correo') || null,
      notas: texto(formData, 'notas') || null,
      valorAcordado: valorTexto ? parseMoneyInput(valorTexto) : null,
    })
  } catch (e) {
    return errorDeAccion(e, 'No se pudo guardar la inscripción.', 'talleres')
  }
  revalidarTaller(tallerId)
  return { success: true, mensaje: 'Guardado.' }
}

export async function cancelarInscripcionAction(tallerId: string, inscripcionId: string): Promise<TallerState> {
  try {
    const { supabase, actor } = await actorConRol(['admin', 'caja'])
    await cancelarInscripcion(supabase, actor, inscripcionId)
  } catch (e) {
    return errorDeAccion(e, 'No se pudo cancelar la inscripción.', 'talleres')
  }
  revalidarTaller(tallerId)
  return { success: true }
}

export async function registrarGastoTallerAction(tallerId: string, _prev: TallerState, formData: FormData): Promise<TallerState> {
  try {
    const { supabase, user } = await requireAdmin()
    await registrarGastoTaller(supabase, { userId: user.id, role: 'admin' }, {
      tallerId,
      concepto: texto(formData, 'concepto'),
      monto: parseMoneyInput(formData.get('monto')) ?? 0,
      categoria: texto(formData, 'categoria') || 'Otros',
      metodoPago: texto(formData, 'metodo_pago'),
      fecha: texto(formData, 'fecha') || fechaHoyBogota(),
      notas: texto(formData, 'notas') || null,
    })
  } catch (e) {
    return errorDeAccion(e, 'No se pudo registrar el gasto.', 'talleres')
  }
  revalidarTaller(tallerId, true)
  return { success: true, mensaje: 'Gasto registrado.' }
}

/** Anula un pago o un gasto del taller (queda en el historial como anulado, con su rastro). */
export async function anularMovimientoTallerAction(
  tallerId: string,
  tipo: 'venta_externa' | 'egreso',
  movimientoId: string
): Promise<TallerState> {
  try {
    const { supabase, user } = await requireAdmin()
    await anularMovimiento(supabase, { userId: user.id, role: 'admin' }, {
      tipo,
      movimientoId,
      motivo: tipo === 'egreso' ? 'Anulación de gasto de taller' : 'Anulación de pago de taller',
    })
  } catch (e) {
    return errorDeAccion(e, 'No se pudo anular.', 'talleres')
  }
  revalidarTaller(tallerId, true)
  return { success: true }
}
