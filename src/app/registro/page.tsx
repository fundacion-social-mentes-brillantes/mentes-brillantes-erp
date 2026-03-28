import Link from 'next/link'
import { RegistroForm } from './RegistroForm'

export default function RegistroPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-zinc-200 p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Registro de consultante</h1>
          <p className="text-sm text-zinc-500 mt-2">
            Registro disponible solo para consultantes. Administradores y caja son creados por la administraci\u00f3n.
          </p>
        </div>

        <RegistroForm />

        <div className="text-center mt-6">
          <Link href="/login" className="text-sm font-medium text-emerald-700 hover:text-emerald-800">
            Volver al ingreso
          </Link>
        </div>
      </div>
    </div>
  )
}
