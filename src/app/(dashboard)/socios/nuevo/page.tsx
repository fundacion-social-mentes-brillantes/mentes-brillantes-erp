import { SocioForm } from '../SocioForm'

export default function NuevoSocioPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Nuevo Socio</h1>
        <p className="text-zinc-500">Registra un nuevo socio para la distribución de utilidades.</p>
      </div>
      <SocioForm />
    </div>
  )
}
