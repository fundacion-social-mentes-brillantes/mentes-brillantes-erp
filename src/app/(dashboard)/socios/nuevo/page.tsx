import { SocioForm } from '../SocioForm'
import { requireRoles } from '@/lib/utils/authz'

export default async function NuevoSocioPage() {
  await requireRoles(['admin'])
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Nuevo Socio</h1>
        <p className="text-gris">Registra un nuevo socio para la distribución de utilidades.</p>
      </div>
      <SocioForm />
    </div>
  )
}
