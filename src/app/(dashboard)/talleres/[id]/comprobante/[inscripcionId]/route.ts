import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRoles } from '@/lib/utils/authz'

// Muestra el comprobante de pago que una persona subio desde la invitacion.
// Los comprobantes viven en un bucket privado sin reglas de acceso: solo el
// servidor los lee. Aqui se revisa que quien pide sea del equipo y que el
// comprobante sea de ese taller, y se le da un enlace que vence en un minuto.

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; inscripcionId: string }> }) {
  const { id, inscripcionId } = await params
  try {
    const { supabase } = await requireRoles(['admin', 'caja'])
    const { data: inscripcion } = await supabase
      .from('taller_inscripciones')
      .select('id, taller_id, comprobante_ruta')
      .eq('id', inscripcionId)
      .maybeSingle()
    if (!inscripcion || inscripcion.taller_id !== id || !inscripcion.comprobante_ruta) {
      return new NextResponse('Ese comprobante no existe.', { status: 404 })
    }

    const admin = createAdminClient()
    if (!admin) return new NextResponse('El servidor no está configurado.', { status: 500 })
    const { data, error } = await admin.storage.from('talleres-comprobantes').createSignedUrl(inscripcion.comprobante_ruta, 60)
    if (error || !data?.signedUrl) return new NextResponse('No se pudo abrir el comprobante.', { status: 502 })

    return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return new NextResponse('No tienes permiso para ver este comprobante.', { status: 403 })
  }
}
