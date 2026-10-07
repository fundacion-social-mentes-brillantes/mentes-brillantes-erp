import { createHash } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { ipDeEncabezados, limpiarIntentos, registrarIntentoYExcede } from "./limite-intentos"

// Candado contra quien prueba contraseñas. Lo comparten el inicio de sesion del
// ERP y el del conector MCP, porque es la misma cuenta.
//
// Supabase limita por IP, pero quien le habla es el servidor (Vercel), no la
// persona: sin este candado nadie frenaba a quien probara contraseñas contra
// una cuenta. Cuenta por correo (8 en 15 minutos) y por conexion (30: en la
// fundacion entran varias personas desde el mismo wifi).

const POR_CUENTA = 8
const POR_CONEXION = 30

/** El correo no se guarda tal cual en la tabla de intentos: solo su huella. */
function claveCuenta(email: string) {
  const huella = createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32)
  return `login:${huella}`
}

/** Registra el intento y dice si esa cuenta o esa conexion ya pasaron el tope. */
export async function loginBloqueado(email: string, encabezados: { get(nombre: string): string | null }) {
  const ip = ipDeEncabezados(encabezados)
  return registrarIntentoYExcede(createAdminClient(), [
    { clave: claveCuenta(email), maximo: POR_CUENTA },
    { clave: ip ? `login-ip:${ip}` : "", maximo: POR_CONEXION },
  ])
}

/** Tras entrar bien, la cuenta vuelve a empezar de cero. */
export async function olvidarIntentosDeLogin(email: string) {
  await limpiarIntentos(createAdminClient(), [claveCuenta(email)])
}

export const MENSAJE_DEMASIADOS_INTENTOS =
  "Demasiados intentos seguidos. Espera unos 15 minutos y vuelve a intentar."
