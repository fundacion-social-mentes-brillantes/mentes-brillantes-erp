import { requireAdmin } from '@/lib/utils/authz'
import { TallerForm } from '../TallerForm'

export default async function NuevoTallerPage() {
  await requireAdmin()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Nuevo taller</h1>
        <p className="text-sm text-gris">
          Sirve para cualquier taller, encuentro o evento. Después de crearlo inscribes a la gente y llevas sus cuentas.
        </p>
      </div>
      <TallerForm />
    </div>
  )
}
