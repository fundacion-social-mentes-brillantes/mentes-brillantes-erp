import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { hasEnvVars } from '../env'
import type { Database } from '@/types/database'

export async function updateSession(request: NextRequest) {
  if (!hasEnvVars()) {
    // Si no hay variables de entorno, bypass del middleware para no crashear
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // En la peticion solo viajan nombre y valor; las opciones van en la respuesta.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => {
            const cookieOptions = { ...options, sameSite: 'none' as const, secure: true }
            supabaseResponse.cookies.set(name, value, cookieOptions)
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && !esRutaPublica(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && esRutaSoloSinSesion(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

// Paginas que se ven sin haber iniciado sesion. /registro estaba por fuera y el
// enlace "Registrate" del login devolvia al login: nadie podia registrarse.
const RUTAS_PUBLICAS = ['/login', '/auth', '/registro']
// Con sesion abierta no tiene sentido volver a entrar ni registrarse.
const RUTAS_SOLO_SIN_SESION = ['/login', '/registro']

const empiezaCon = (ruta: string, base: string) => ruta === base || ruta.startsWith(`${base}/`)

export function esRutaPublica(ruta: string): boolean {
  return RUTAS_PUBLICAS.some((base) => empiezaCon(ruta, base))
}

export function esRutaSoloSinSesion(ruta: string): boolean {
  return RUTAS_SOLO_SIN_SESION.some((base) => empiezaCon(ruta, base))
}
