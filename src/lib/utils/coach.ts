// Logica compartida de sesiones coach. La usan el perfil del asistente,
// getCoachSummary y la pagina /sesiones-coach, para que todos calculen las
// sesiones compradas/tomadas/restantes con la misma regla.

export type CoachPaquete = {
  id: string
  cuenta_id?: string | null
  asistente_id?: string | null
  sesiones_compradas?: number | string | null
  creado_en?: string | null
  // Conteo de sesiones del paquete (Supabase lo devuelve como arreglo embebido).
  coach_sesiones?: Array<unknown> | null
}

export type ResumenCoach = {
  compradas: number
  realizadas: number
  restantes: number
}

const cuentaSesiones = (p: CoachPaquete): number => (Array.isArray(p.coach_sesiones) ? p.coach_sesiones.length : 0)
const compradasPaquete = (p: CoachPaquete): number => {
  const n = Number(p.sesiones_compradas)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// Consolida sesiones compradas, realizadas (tomadas) y restantes de un asistente
// sumando todos sus paquetes coach. restantes nunca es negativo.
export function resumenCoach(paquetes: CoachPaquete[] = []): ResumenCoach {
  const compradas = paquetes.reduce((acc, p) => acc + compradasPaquete(p), 0)
  const realizadas = paquetes.reduce((acc, p) => acc + cuentaSesiones(p), 0)
  return { compradas, realizadas, restantes: Math.max(0, compradas - realizadas) }
}

// Devuelve el paquete mas antiguo (por creado_en) que aun tiene cupo
// (realizadas < compradas). Devuelve null si ningun paquete tiene cupo.
// Asi una sesion nueva se registra contra el paquete correcto y no se sobre-llenan
// ni se usan paquetes agotados.
export function paqueteDestino(paquetes: CoachPaquete[] = []): CoachPaquete | null {
  const ordenados = [...paquetes].sort((a, b) => {
    const fa = a.creado_en || ''
    const fb = b.creado_en || ''
    if (fa < fb) return -1
    if (fa > fb) return 1
    return 0
  })
  return ordenados.find((p) => cuentaSesiones(p) < compradasPaquete(p)) || null
}

// Igual que paqueteDestino pero para un paquete concreto: lo devuelve solo si es
// de la lista y aun tiene cupo. Sirve cuando la sesion tiene que caer en un
// paquete determinado (el que se acaba de crear) y no en el mas antiguo.
export function paqueteConCupo(paquetes: CoachPaquete[] = [], paqueteId: string): CoachPaquete | null {
  const paquete = paquetes.find((p) => p.id === paqueteId)
  return paquete && cuentaSesiones(paquete) < compradasPaquete(paquete) ? paquete : null
}

export type EstadoCoach = 'disponible' | 'ultima' | 'agotado'

// Semaforo visual: verde (disponible), amarillo (queda 1), rojo/gris (agotado).
export function estadoCoach(restantes: number): EstadoCoach {
  if (restantes <= 0) return 'agotado'
  if (restantes === 1) return 'ultima'
  return 'disponible'
}
