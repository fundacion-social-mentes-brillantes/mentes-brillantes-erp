import { LoginForm } from './LoginForm'
import { GoogleButton } from './GoogleButton'
import Image from 'next/image'

export default function LoginPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-campo px-4 py-10">
      <div className="mb-6 flex flex-col items-center text-center text-sobre-campo">
        <Image
          src="/logo-gemb-simbolo.png"
          alt="Gimnasio Emocional Mentes Brillantes"
          width={144}
          height={84}
          priority
          className="h-20 w-auto"
        />
        <h1 className="mt-4 text-2xl font-semibold tracking-[-0.01em]">Mentes Brillantes</h1>
        <p className="mt-1 text-sm text-sobre-campo-suave">Gimnasio Emocional</p>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-linea bg-panel p-6 shadow-strong sm:p-8">
        <p className="mb-5 text-sm text-gris">Ingresa tus credenciales para acceder al sistema</p>

        <LoginForm />

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-linea" />
          <span className="text-sm text-gris">o</span>
          <span className="h-px flex-1 bg-linea" />
        </div>

        <GoogleButton />
      </div>
    </div>
  )
}
