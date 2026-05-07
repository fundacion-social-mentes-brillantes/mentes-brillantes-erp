import { LoginForm } from './LoginForm'
import Link from 'next/link'
import Image from 'next/image'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-[radial-gradient(circle_at_top,rgba(var(--gold),0.22),transparent_28rem),linear-gradient(135deg,rgb(var(--bg)),rgb(var(--surface-2)))]">
      <div className="w-full max-w-md premium-card rounded-3xl p-8">
        <div className="text-center mb-8">
          <div className="relative mx-auto mb-5 h-24 w-56">
            <Image
              src="/logo-mentes-brillantes.png"
              alt="Gimnasio Emocional Mentes Brillantes"
              fill
              priority
              sizes="224px"
              className="object-contain"
            />
          </div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-[rgb(var(--warning))] font-semibold">ERP Financiero</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[rgb(var(--text-primary))]">
            Mentes Brillantes
          </h1>
          <p className="text-sm text-[rgb(var(--text-muted))] mt-2">
            Ingresa tus credenciales para acceder al sistema
          </p>
        </div>

        <LoginForm />

        <div className="text-center mt-6">
          <Link href="/registro" className="text-sm font-semibold text-[rgb(var(--accent-strong))] hover:text-[rgb(var(--accent))]">
            Registrarse
          </Link>
        </div>
      </div>
    </div>
  )
}
