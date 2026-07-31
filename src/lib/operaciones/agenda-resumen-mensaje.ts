import type { Diferencia } from "./agenda-sync"
import type { Cobertura } from "./agenda-cobertura"

// Como se ve el aviso diario de Telegram. Vive aparte de la ruta del cron para
// poder probarlo: es texto que alguien lee a las 8 de la maniana para decidir
// que cobra y que no, asi que vale la pena fijarlo con pruebas.

const TITULOS: Record<Diferencia["tipo"], string> = {
  evento_borrado_con_sesion: "Se borró de la agenda algo ya cobrado",
  sesion_sin_registrar: "Sesiones dictadas sin registrar",
  fecha_movida: "Sesiones que cambiaron de fecha",
  persona_nueva: "Personas de la agenda que no están en el ERP",
}

/** Cuántas personas se listan antes de resumir el resto. */
const MAX_PERSONAS = 10

function icono(cobertura?: Cobertura): string {
  if (!cobertura) return "·"
  if (!cobertura.tieneCupo) return "🔴"
  return cobertura.paquetePagado ? "✅" : "⚠️"
}

/**
 * Junta las fechas seguidas que comparten la misma situacion de cupo. Dentro de
 * una persona el cupo se agota en orden, asi que lo normal es que salgan uno o
 * dos grupos: las que ya estaban compradas y las que no.
 *
 * Se agrupa por la situacion y el paquete, NO por el texto: el resumen lleva
 * dentro el contador de cupo, que baja en cada sesion, y compararlo dejaria una
 * linea por sesion. Se muestra el resumen de la primera, que es la que dice
 * cuanto cupo habia al empezar.
 */
function agruparPorSituacion(suyas: Diferencia[]) {
  const grupos: Array<{ clave: string; icono: string; resumen: string; fechas: string[] }> = []
  for (const d of suyas) {
    const c = d.cobertura
    const clave = c ? `${c.situacion}|${c.paquete ?? ""}|${c.paquetePendiente}` : "sin-datos"
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.clave === clave) {
      ultimo.fechas.push(d.fecha)
      continue
    }
    grupos.push({
      clave,
      icono: icono(c),
      resumen: c?.resumen || "no se pudo calcular el cupo",
      fechas: [d.fecha],
    })
  }
  return grupos
}

/**
 * Las sesiones sin registrar se agrupan por persona. Una lista plana de catorce
 * lineas no se lee, y repetir "sin cupo" en cada sesion de la misma persona no
 * ayuda a decidir nada.
 */
function bloqueSesionesSinRegistrar(lista: Diferencia[]): string[] {
  const porPersona = new Map<string, Diferencia[]>()
  for (const d of lista) {
    const clave = d.nombrePersona || `código ${d.codigoPersona}`
    const suyas = porPersona.get(clave) || []
    suyas.push(d)
    porPersona.set(clave, suyas)
  }

  const lineas: string[] = []

  const conCupo = lista.filter((d) => d.cobertura?.tieneCupo).length
  const porCobrar = lista.filter((d) => d.cobertura && !d.cobertura.tieneCupo).length
  if (conCupo || porCobrar) {
    lineas.push(`   ${conCupo} ya estaban compradas · ${porCobrar} hay que cobrarlas`)
  }

  const personas = Array.from(porPersona.entries())
  for (const [nombre, suyas] of personas.slice(0, MAX_PERSONAS)) {
    suyas.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
    lineas.push(`   · ${nombre} — ${suyas.length} sesión(es)`)
    for (const grupo of agruparPorSituacion(suyas)) {
      lineas.push(`     ${grupo.icono} ${grupo.fechas.join(", ")} → ${grupo.resumen}`)
    }
  }
  if (personas.length > MAX_PERSONAS) {
    lineas.push(`   · …y ${personas.length - MAX_PERSONAS} persona(s) más`)
  }

  return lineas
}

export function armarMensaje(
  diferencias: Diferencia[],
  ventana: { desde: string; hasta: string }
): string {
  const porTipo = new Map<Diferencia["tipo"], Diferencia[]>()
  for (const d of diferencias) {
    const lista = porTipo.get(d.tipo) || []
    lista.push(d)
    porTipo.set(d.tipo, lista)
  }

  const partes: string[] = [
    `Agenda vs ERP — ${diferencias.length} cosa(s) por revisar`,
    `(del ${ventana.desde} al ${ventana.hasta})`,
    "",
  ]

  // El orden de calcularDiferencias ya pone primero lo mas delicado.
  for (const [tipo, lista] of Array.from(porTipo.entries())) {
    partes.push(`▸ ${TITULOS[tipo]} (${lista.length})`)
    if (tipo === "sesion_sin_registrar") {
      partes.push(...bloqueSesionesSinRegistrar(lista))
    } else {
      for (const d of lista.slice(0, 8)) partes.push(`   · ${d.mensaje}`)
      if (lista.length > 8) partes.push(`   · …y ${lista.length - 8} más`)
    }
    partes.push("")
  }

  partes.push("Nada se registra solo. Dime cuáles apruebas.")
  return partes.join("\n")
}
