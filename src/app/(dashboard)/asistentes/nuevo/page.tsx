import { AsistenteForm } from '../AsistenteForm'
import { obtenerSiguienteCodigoAsistente } from '../actions'
import { requireRoles } from '@/lib/utils/authz'

export default async function NuevoAsistentePage() {
  const { perfil } = await requireRoles(['admin', 'caja'])
  const codigoSugerido = await obtenerSiguienteCodigoAsistente()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-tinta md:text-[1.75rem]">Nuevo Asistente</h1>
        <p className="text-gris">Registra un nuevo asistente o paciente en el sistema.</p>
      </div>
      <AsistenteForm codigoSugerido={codigoSugerido} readOnlyDates={perfil.rol === 'caja'} />
    </div>
  )
}
