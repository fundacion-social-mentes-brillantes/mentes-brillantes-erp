import Link from "next/link"
import { MigracionForm } from "./MigracionForm"
import { EmpresaForm } from "@/components/configuracion/EmpresaForm"
import { requireRoles } from "@/lib/utils/authz"

export default async function ConfiguracionPage() {
  const { supabase } = await requireRoles(["admin"])
  const isAdmin = true

  const { data: empresaData } =
    (await supabase?.from("configuracion_empresa").select("*").eq("id", 1).single()) || { data: null }

  const defaultEmpresa = {
    nombre: "FUNDACION SOCIAL MENTES BRILLANTES",
    nit: "901002849-3",
    correo: null,
    telefono: null,
    ciudad: null,
  }

  const empresa = empresaData || defaultEmpresa

  const tables = [
    "configuracion_empresa",
    "asistentes",
    "cuentas_por_cobrar",
    "pagos_abonos",
    "egresos",
    "socios",
    "periodos",
    "adelantos_socios",
    "donaciones_asistentes",
    "coach_paquetes",
    "coach_sesiones",
    "movimientos_saldo_favor",
    "perfiles",
    "liquidaciones_socios",
    "liquidaciones_resumen_cuentas",
  ]

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Configuracion</h1>
        <p className="text-zinc-500 text-sm">Ajustes del sistema y migracion de datos.</p>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">Datos de la Fundacion</h2>
          <p className="text-sm text-zinc-500 mt-1">Informacion que aparecera en los documentos exportados (PDF, PNG).</p>
        </div>
        <div className="p-6">
          <EmpresaForm initialData={empresa} isAdmin={isAdmin} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">Migracion de Datos (AppSheet / CSV)</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Sube archivos CSV exportados desde AppSheet para importar los datos al nuevo sistema. El sistema evitara
            duplicados basandose en el "Row ID" original.
          </p>
        </div>
        <div className="p-6">
          <MigracionForm />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">Respaldo de datos</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Exporta tablas en CSV o genera un backup completo (ZIP) con todos los datos y schema.sql. Solo disponible para
            administradores.
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-800 mb-2">Tablas principales (CSV)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {tables.map((table) => (
                <Link
                  key={table}
                  href={`/api/backup/${table}`}
                  className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  {table}.csv
                </Link>
              ))}
            </div>
          </div>
          <div className="pt-2">
            <h3 className="text-sm font-semibold text-zinc-800 mb-2">Respaldo completo (ZIP)</h3>
            <Link
              href="/api/backup/full"
              className="inline-flex items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              Descargar backup completo (.zip)
            </Link>
            <p className="text-xs text-zinc-500 mt-2">
              Incluye todos los CSV, schema.sql y README con fecha/hora y orden sugerido de restauracion. La tabla
              perfiles NO reemplaza auth.users; este backup no restaura usuarios ni contrasenas de Supabase Auth.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
