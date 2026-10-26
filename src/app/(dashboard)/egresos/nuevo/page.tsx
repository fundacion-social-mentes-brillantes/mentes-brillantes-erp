import { EgresoForm } from '../EgresoForm'
import { requireRoles } from '@/lib/utils/authz'

export default async function NuevoEgresoPage() {
  await requireRoles(['admin'])
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Nuevo Egreso</h1>
        <p className="text-gris text-sm">Registra un gasto operativo o administrativo.</p>
      </div>
      <EgresoForm />
    </div>
  )
}
