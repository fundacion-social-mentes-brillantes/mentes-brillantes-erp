import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Excluimos APIs internas, estáticos y los recursos públicos de la PWA
    // (manifest, service worker y página offline) para que sean accesibles
    // sin sesión y la app se pueda instalar correctamente.
    '/((?!api/telegram|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw\\.js|offline\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
}
