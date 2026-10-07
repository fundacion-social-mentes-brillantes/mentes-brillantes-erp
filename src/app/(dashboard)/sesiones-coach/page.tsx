import { filtrarPagosValidos, sumarMontos, toSafeNumber } from '@/lib/utils/contable'
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

  type Paquete = NonNullable<typeof paquetes>[number]
  type CuentaDelPaquete = NonNullable<Paquete['cuentas_por_cobrar']>

  /** Lo que falta por pagar; un pago anulado (por estado o por nota) no cuenta. */
  const pendienteDe = (cuenta: CuentaDelPaquete | null | undefined): number => {
    if (!cuenta) return 0
    const pagado = sumarMontos(filtrarPagosValidos(cuenta.pagos_abonos || []))
    return Math.max(0, toSafeNumber(cuenta.valor_total) - pagado)
  }

  type SesionDeFila = { id: string; fecha: string; notas: string | null; paqueteId: string; paqueteConcepto: string | null }
  type PaqueteDeFila = {
    id: string
    sesiones_compradas: number
    creado_en: string | null
    coach_sesiones: Paquete['coach_sesiones']
    cuentaId: string | null
    concepto: string | null
    compradoEl: string | null
    valorTotal: number
    pendiente: number
  }
  type FilaAsistente = {
    asistenteId: string
    nombre: string
    codigo: string | null
    cedula: string | null
    paquetes: PaqueteDeFila[]
    sesiones: SesionDeFila[]
  }

  const porAsistente = new Map<string, FilaAsistente>()
  for (const p of paquetes || []) {
    const aid = p.asistente_id
    if (!aid) continue
    let row = porAsistente.get(aid)
    if (!row) {
      const asis = p.asistentes
      row = {
        asistenteId: aid,
        nombre: asis?.nombre || 'Sin nombre',
        codigo: asis?.codigo || null,
        cedula: asis?.cedula || null,
        paquetes: [],
        sesiones: [],
      }
      porAsistente.set(aid, row)
    }
    const sesionesPaquete = p.coach_sesiones || []
    const cuenta = p.cuentas_por_cobrar

    row.paquetes.push({
      id: p.id,
      sesiones_compradas: p.sesiones_compradas,
      creado_en: p.creado_en,
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
        paqueteId: p.id,
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
        .map((p) => ({
          id: p.id,
          cuentaId: p.cuentaId,
          concepto: p.concepto,
          compradoEl: p.compradoEl,
          valorTotal: p.valorTotal,
          pendiente: p.pendiente,
          compradas: Number(p.sesiones_compradas || 0),
          usadas: (p.coach_sesiones || []).length,
          restantes: Math.max(0, Number(p.sesiones_compradas || 0) - (p.coach_sesiones || []).length),
          sesiones: [...(p.coach_sesiones || [])].sort((a, b) =>
            a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0
          ),
        }))
        .sort((a, b) => {
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
