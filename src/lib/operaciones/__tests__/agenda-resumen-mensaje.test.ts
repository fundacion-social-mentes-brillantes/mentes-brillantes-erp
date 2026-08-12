import { describe, expect, it } from "vitest"
import { armarMensaje } from "../agenda-resumen-mensaje"
import { repartirCupo, type EstadoCupo } from "../agenda-cobertura"
import type { Diferencia } from "../agenda-sync"

// Caso real del 30 de julio de 2026, con el cupo que cada persona tenia de
// verdad. Sirve de ejemplo vivo: si el aviso vuelve a quedar ambiguo, esto se
// rompe.

const CUPOS: Record<string, EstadoCupo> = {
  // Dos paquetes pagados; el viejo agotado, el de 24 con 17 libres.
  Catalina: {
    deudaTotal: 0,
    paquetes: [
      { id: "c1", concepto: "Sesión guía coach - 10 sesiones", creadoEn: "2026-03-25", compradas: 10, usadas: 10, pendiente: 0 },
      { id: "c2", concepto: "Sesión guía coach - 24 sesiones", creadoEn: "2026-05-17", compradas: 24, usadas: 7, pendiente: 0 },
    ],
  },
  // Tiene cupo de sobra, pero el paquete va por la mitad.
  Gloria: {
    deudaTotal: 2500000,
    paquetes: [
      { id: "g1", concepto: "Sesión guía coach - 1 sesiones", creadoEn: "2026-05-25", compradas: 1, usadas: 1, pendiente: 0 },
      { id: "g2", concepto: "Sesión guía coach - 24 sesiones", creadoEn: "2026-06-17", compradas: 24, usadas: 1, pendiente: 2500000 },
    ],
  },
  // Sin un solo cupo libre y con deuda grande: son sesiones por cobrar.
  Marcela: { deudaTotal: 1903300, paquetes: [] },
  Luz: {
    deudaTotal: 4999000,
    paquetes: [
      { id: "l1", concepto: "Sesión guía coach - 24 sesiones", creadoEn: "2026-07-09", compradas: 24, usadas: 2, pendiente: 4999000 },
    ],
  },
}

const AGENDA: Array<[keyof typeof CUPOS, string, string[]]> = [
  ["Catalina", "Catalina Fernandez Luengas", ["2026-07-03", "2026-07-10", "2026-07-30"]],
  ["Gloria", "Gloria Stella Fernandez Camelo", ["2026-07-01", "2026-07-10", "2026-07-29"]],
  ["Marcela", "Marcela Sanchez", ["2026-07-03", "2026-07-11", "2026-07-29"]],
  ["Luz", "Luz Miriam Garzon", ["2026-07-11"]],
]

function escenarioReal(): Diferencia[] {
  const salida: Diferencia[] = []
  for (const [clave, nombre, fechas] of AGENDA) {
    const coberturas = repartirCupo(CUPOS[clave], fechas.length)
    fechas.forEach((fecha, i) => {
      salida.push({
        tipo: "sesion_sin_registrar",
        eventoId: `${clave}-${fecha}`,
        fecha,
        codigoPersona: null,
        nombrePersona: nombre,
        mensaje: `${nombre} tuvo sesión el ${fecha} según la agenda, pero no está registrada en el ERP.`,
        accionSugerida: coberturas[i].accion,
        cobertura: coberturas[i],
      })
    })
  }
  return salida
}

describe("armarMensaje", () => {
  const mensaje = armarMensaje(escenarioReal(), { desde: "2026-06-15", hasta: "2026-08-14" })
  it("dice de entrada cuántas están compradas y cuántas hay que cobrar", () => {
    // 7 con cupo (Catalina 3, Gloria 3, Luz 1) y 3 sin cupo (Marcela).
    expect(mensaje).toContain("7 ya estaban compradas · 3 hay que cobrarlas")
  })

  it("a quien tiene el paquete pagado no le inventa un cobro", () => {
    expect(mensaje).toContain("✅ 2026-07-03, 2026-07-10, 2026-07-30 → con cupo pagado")
  })

  it("marca aparte el cupo que sale de un paquete a medio pagar", () => {
    expect(mensaje).toContain("⚠️")
    expect(mensaje).toContain("aún debe $2.500.000")
  })

  it("a quien no tiene cupo lo señala con su deuda", () => {
    expect(mensaje).toContain("🔴")
    expect(mensaje).toContain("sin cupo")
    expect(mensaje).toContain("$1.903.300")
  })

  it("agrupa por persona en vez de repetir una línea por sesión", () => {
    expect(mensaje).toContain("Marcela Sanchez — 3 sesión(es)")
    // Cuatro personas, no diez lineas sueltas.
    expect(mensaje.match(/^ {3}· /gm)?.length).toBe(4)
  })

  it("junta en una sola línea las sesiones que están en la misma situación", () => {
    // Las tres de Catalina salen del mismo paquete pagado: una linea, no tres.
    expect(mensaje.match(/^ {5}✅/gm)?.length).toBe(1)
    expect(mensaje.match(/^ {5}🔴/gm)?.length).toBe(1)
  })

  it("sigue sin registrar nada por su cuenta", () => {
    expect(mensaje).toContain("Nada se registra solo")
  })

  // Sin esto, una comparación hecha contra un espejo viejo se lee igual que una
  // comparación limpia: el silencio deja de significar "estoy al día".
  it("pone arriba el aviso de que la comparación puede estar incompleta", () => {
    const conAviso = armarMensaje(escenarioReal(), { desde: "2026-06-15", hasta: "2026-08-14" }, "La agenda no reporta desde hace 7 dia(s).")

    expect(conAviso.split("\n")[3]).toBe("⚠️ La agenda no reporta desde hace 7 dia(s).")
    expect(conAviso).toContain("7 ya estaban compradas")
  })

  it("sin diferencias pero con aviso, no dice que todo cuadra", () => {
    const soloAviso = armarMensaje([], { desde: "2026-06-15", hasta: "2026-08-14" }, "La agenda no reporta desde hace 7 dia(s).")

    expect(soloAviso).toContain("no se pudo comparar")
    expect(soloAviso).toContain("no hay con qué compararlas")
    expect(soloAviso).not.toContain("cosa(s) por revisar")
  })

  it("sin diferencias y sin aviso no se arma mensaje alarmista", () => {
    const limpio = armarMensaje([], { desde: "2026-06-15", hasta: "2026-08-14" })

    expect(limpio).toContain("0 cosa(s) por revisar")
  })
})
