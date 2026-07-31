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
    .select(
      'id, asistente_id, sesiones_compradas, creado_en, asistentes(nombre, codigo, cedula), coach_sesiones(id, fecha, notas), cuentas_por_cobrar(id, concepto, valor_total, fecha_emision, estado, pagos_abonos(monto, estado, notas))'
    )
    .order('creado_en', { ascending: true })

  /** Un pago anulado no cuenta. Se marca por partida doble: estado y nota. */
  const pendienteDe = (cuenta: any): number => {
    if (!cuenta) return 0
    const pagado = (cuenta.pagos_abonos || [])
      .filter((p: any) => {
        const anulado =
          String(p?.estado || '').toLowerCase() === 'anulado' ||
          String(p?.notas || '').toUpperCase().includes('[ANULADO]')
        return !anulado
      })
      .reduce((total: number, p: any) => total + Number(p?.monto || 0), 0)
    return Math.max(0, Number(cuenta.valor_total || 0) - pagado)
  }

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
    const cuenta = Array.isArray((p as any).cuentas_por_cobrar)
      ? (p as any).cuentas_por_cobrar[0]
      : (p as any).cuentas_por_cobrar

    row.paquetes.push({
      id: (p as any).id,
      sesiones_compradas: (p as any).sesiones_compradas,
      creado_en: (p as any).creado_en,
      coach_sesiones: sesionesPaquete,
      // Lo que hace falta para poder ver cada compra por separado.
      cuentaId: cuenta?.id ?? null,
      concepto: cuenta?.concepto ?? null,
      compradoEl: cuenta?.fecha_emision ?? null,
      valorTotal: Number(cuenta?.valor_total || 0),
      pendiente: pendienteDe(cuenta),
    })
    for (const s of sesionesPaquete) {
      // De que compra salio cada sesion: es lo que se perdia al aplanar la lista.
      row.sesiones.push({
        id: s.id,
        fecha: s.fecha,
        notas: s.notas,
        paqueteId: (p as any).id,
        paqueteConcepto: cuenta?.concepto ?? null,
      })
    }
  }

  const asistentes = Array.from(porAsistente.values())
    .map((row) => {
      const { compradas, realizadas, restantes } = resumenCoach(row.paquetes)
      const sesiones = [...row.sesiones].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))

      // Cada compra por separado, de la mas nueva a la mas vieja, con sus
      // sesiones colgando. Es lo que faltaba para no ver todo revuelto.
      const compras = row.paquetes
        .map((p: any) => ({
          id: p.id,
          cuentaId: p.cuentaId,
          concepto: p.concepto,
          compradoEl: p.compradoEl,
          valorTotal: p.valorTotal,
          pendiente: p.pendiente,
          compradas: Number(p.sesiones_compradas || 0),
          usadas: (p.coach_sesiones || []).length,
          restantes: Math.max(0, Number(p.sesiones_compradas || 0) - (p.coach_sesiones || []).length),
          sesiones: [...(p.coach_sesiones || [])].sort((a: any, b: any) =>
            a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0
          ),
        }))
        .sort((a: any, b: any) => {
          const fa = a.compradoEl || ''
          const fb = b.compradoEl || ''
          return fa < fb ? 1 : fa > fb ? -1 : 0
        })

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
        compras,
      }
    })
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))

  return <SesionesCoachClient asistentes={asistentes} hoy={fechaHoyBogota()} isAdmin={isAdmin} />
}
