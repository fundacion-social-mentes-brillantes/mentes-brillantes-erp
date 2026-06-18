import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/utils/authz'
import { resumenCoach } from '@/lib/utils/coach'
import { fechaHoyBogota } from '@/lib/utils/fechas'
import { SesionesCoachClient } from './SesionesCoachClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SesionesCoachPage() {
  const profile = await getCurrentProfile().catch(() => null)
  if (!profile) redirect('/login')
  if (profile.perfil.rol === 'consulta') redirect('/mi-estado')

  const supabase = profile.supabase
  const isAdmin = profile.perfil.rol === 'admin'

  // Reutiliza las mismas tablas y la misma regla de conteo (resumenCoach) que el
  // perfil del asistente. Trae todos los paquetes coach con sus sesiones.
  const { data: paquetes } = await supabase
    .from('coach_paquetes')
    .select('id, asistente_id, sesiones_compradas, creado_en, asistentes(nombre, codigo, cedula), coach_sesiones(id, fecha, notas)')
    .order('creado_en', { ascending: true })

  const porAsistente = new Map<string, any>()
  for (const p of paquetes || []) {
    const aid = (p as any).asistente_id
    if (!aid) continue
    if (!porAsistente.has(aid)) {
      const asis = Array.isArray((p as any).asistentes) ? (p as any).asistentes[0] : (p as any).asistentes
      porAsistente.set(aid, {
        asistenteId: aid,
        nombre: asis?.nombre || 'Sin nombre',
        codigo: asis?.codigo || null,
        cedula: asis?.cedula || null,
        paquetes: [],
        sesiones: [] as any[],
      })
    }
    const row = porAsistente.get(aid)
    const sesionesPaquete = (p as any).coach_sesiones || []
    row.paquetes.push({
      id: (p as any).id,
      sesiones_compradas: (p as any).sesiones_compradas,
      creado_en: (p as any).creado_en,
      coach_sesiones: sesionesPaquete,
    })
    for (const s of sesionesPaquete) {
      row.sesiones.push({ id: s.id, fecha: s.fecha, notas: s.notas })
    }
  }

  const asistentes = Array.from(porAsistente.values())
    .map((row) => {
      const { compradas, realizadas, restantes } = resumenCoach(row.paquetes)
      const sesiones = [...row.sesiones].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
      return {
        asistenteId: row.asistenteId,
        nombre: row.nombre,
        codigo: row.codigo,
        cedula: row.cedula,
        compradas,
        realizadas,
        restantes,
        ultimaSesion: sesiones[0]?.fecha || null,
        sesiones,
      }
    })
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))

  return <SesionesCoachClient asistentes={asistentes} hoy={fechaHoyBogota()} isAdmin={isAdmin} />
}
