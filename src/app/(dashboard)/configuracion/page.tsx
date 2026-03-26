import { MigracionForm } from './MigracionForm'
import { EmpresaForm } from '@/components/configuracion/EmpresaForm'
import { requireRoles } from '@/lib/utils/authz'

export default async function ConfiguracionPage() {
  const { supabase } = await requireRoles(['admin'])
  const isAdmin = true

  // Get company config
  const { data: empresaData } = await supabase?.from('configuracion_empresa').select('*').eq('id', 1).single() || { data: null }
  
  const defaultEmpresa = {
    nombre: 'FUNDACION SOCIAL MENTES BRILLANTES',
    nit: '901002849-3',
    correo: null,
    telefono: null,
    ciudad: null
  }

  const empresa = empresaData || defaultEmpresa

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Configuración</h1>
        <p className="text-zinc-500 text-sm">Ajustes del sistema y migración de datos.</p>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">Datos de la Fundación</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Información que aparecerá en los documentos exportados (PDF, PNG).
          </p>
        </div>
        <div className="p-6">
          <EmpresaForm initialData={empresa} isAdmin={isAdmin} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">Migración de Datos (AppSheet / CSV)</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Sube archivos CSV exportados desde AppSheet para importar los datos al nuevo sistema.
            El sistema evitará duplicados basándose en el "Row ID" original.
          </p>
        </div>
        <div className="p-6">
          <MigracionForm />
        </div>
      </div>
    </div>
  )
}
