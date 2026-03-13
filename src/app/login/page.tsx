import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-zinc-200 p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Mentes Brillantes
          </h1>
          <p className="text-sm text-zinc-500 mt-2">
            Ingresa tus credenciales para acceder al sistema
          </p>
        </div>

        <LoginForm />
      </div>
    </div>
  )
}
