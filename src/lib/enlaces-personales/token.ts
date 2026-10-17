import { createHmac, timingSafeEqual } from "node:crypto"

// Enlace personal "Mi proceso": /p/<token>.
//
// El token NO se guarda en la base: es la persona (su id) y la version de su
// enlace, firmados con ENLACES_PERSONALES_SECRETO. Asi ni una copia de la base
// revela los enlaces. Para apagar uno se marca inactivo en enlaces_personales y
// para cambiarlo se sube la version: el token viejo deja de coincidir.
//
// Formato (36 bytes en base64url = 48 caracteres):
//   16 bytes del uuid de la persona | 4 bytes de la version | 16 bytes de firma

const LARGO_FIRMA = 16
const LARGO_CUERPO = 16 + 4
const PROPOSITO = "gemb:mi-proceso:v1:"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** El secreto de la firma, o null si falta o es demasiado corto para ser seguro. */
export function secretoEnlaces(): string | null {
  const secreto = process.env.ENLACES_PERSONALES_SECRETO
  return secreto && secreto.length >= 32 ? secreto : null
}

function firmar(cuerpo: Buffer, secreto: string): Buffer {
  return createHmac("sha256", secreto).update(PROPOSITO).update(cuerpo).digest().subarray(0, LARGO_FIRMA)
}

export function crearTokenEnlace(asistenteId: string, version: number, secreto: string): string {
  if (!UUID.test(asistenteId)) throw new Error("Id de persona invalido para el enlace.")
  if (!Number.isInteger(version) || version < 1) throw new Error("Version de enlace invalida.")
  const cuerpo = Buffer.alloc(LARGO_CUERPO)
  Buffer.from(asistenteId.replace(/-/g, ""), "hex").copy(cuerpo, 0)
  cuerpo.writeUInt32BE(version, 16)
  return Buffer.concat([cuerpo, firmar(cuerpo, secreto)]).toString("base64url")
}

/** Persona y version de un token bien firmado; null si el token no es valido. */
export function leerTokenEnlace(token: string, secreto: string): { asistenteId: string; version: number } | null {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{48}$/.test(token)) return null
  const datos = Buffer.from(token, "base64url")
  if (datos.length !== LARGO_CUERPO + LARGO_FIRMA) return null

  const cuerpo = datos.subarray(0, LARGO_CUERPO)
  const firma = datos.subarray(LARGO_CUERPO)
  if (!timingSafeEqual(firma, firmar(cuerpo, secreto))) return null

  const hex = cuerpo.subarray(0, 16).toString("hex")
  const asistenteId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  return { asistenteId, version: cuerpo.readUInt32BE(16) }
}

/**
 * Quien abre el enlace para armar la vista previa (WhatsApp, Telegram, buscadores).
 * A ellos se les muestra una pagina sin datos de la persona.
 */
export function esVistaPreviaDeEnlace(userAgent: string | null | undefined): boolean {
  return /whatsapp|facebookexternalhit|facebot|meta-externalagent|telegrambot|twitterbot|slackbot|discordbot|linkedinbot|skypeuripreview|googlebot|bingbot|applebot|iframely|embedly|bot\b|crawler|spider/i.test(
    userAgent || ""
  )
}
