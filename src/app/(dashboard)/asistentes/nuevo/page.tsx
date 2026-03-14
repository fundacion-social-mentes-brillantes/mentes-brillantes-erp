import { AsistenteForm } from '../AsistenteForm'
import { obtenerSiguienteCodigoAsistente } from '../actions'

export default async function NuevoAsistentePage() {
  const codigoSugerido = await obtenerSiguienteCodigoAsistente()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Nuevo Asistente</h1>
        <p className="text-zinc-500">Registra un nuevo asistente o paciente en el sistema.</p>
      </div>
      <AsistenteForm codigoSugerido={codigoSugerido} />
    </div>
  )
}
