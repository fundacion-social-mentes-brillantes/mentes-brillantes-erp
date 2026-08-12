import { describe, expect, it, vi } from "vitest"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }))

import { OPERACIONES as OPERACIONES_ESCRITURA, registerEscrituraTools } from "../escritura-tools"

// El MCP debe conceder EXACTAMENTE los mismos permisos que el ERP por
// navegador. Si mañana entra una cajera y se le da el MCP con su usuario, no
// puede poder mas (ni menos) de lo que podria haciendo clic en la web.
//
// Esta tabla es el contrato, tomado de las server actions del ERP:
//   admin+caja -> crear (requireRoles(["admin","caja"]))
//   solo admin -> editar, anular, eliminar, revertir, egresos, socios,
//                 periodos y liquidaciones (requireAdmin)
const PERMISOS_ESPERADOS: Record<string, Array<"admin" | "caja">> = {
  // Crear: tambien la cajera
  registrar_pago: ["admin", "caja"],
  cuenta: ["admin", "caja"],
  venta_externa: ["admin", "caja"],
  donacion: ["admin", "caja"],
  anticipo: ["admin", "caja"],
  aplicar_saldo_favor: ["admin", "caja"],
  sesion_coach: ["admin", "caja"],
  persona: ["admin", "caja"],
  editar_persona: ["admin", "caja"],

  // Egresos: en el ERP la cajera NO puede, ni siquiera crear.
  egreso: ["admin"],

  // Corregir y deshacer: solo admin
  anular_movimiento: ["admin"],
  eliminar_movimiento: ["admin"],
  editar_movimiento: ["admin"],
  editar_valor_cuenta: ["admin"],
  corregir_monto_pago: ["admin"],
  eliminar_cuenta: ["admin"],
  revertir_abono: ["admin"],
  revertir_anticipo: ["admin"],
  pagar_deudas_con_saldo: ["admin"],
  estado_persona_activa: ["admin"],
  eliminar_persona: ["admin"],
  editar_sesion_coach: ["admin"],
  eliminar_sesion_coach: ["admin"],

  // Estructura del negocio: solo admin
  socio: ["admin"],
  editar_socio: ["admin"],
  estado_socio_activo: ["admin"],
  periodo: ["admin"],
  fecha_fin_periodo: ["admin"],
  adelanto_socio: ["admin"],
  devolucion_adelanto: ["admin"],
  cerrar_liquidacion: ["admin"],
}

describe("permisos de escritura del MCP", () => {
  it("cada operación exige los mismos roles que el ERP por navegador", () => {
    for (const operacion of OPERACIONES_ESCRITURA) {
      const esperado = PERMISOS_ESPERADOS[operacion.nombre]
      expect(esperado, `falta declarar el permiso esperado de "${operacion.nombre}"`).toBeDefined()
      expect([...operacion.roles].sort(), `roles de "${operacion.nombre}"`).toEqual([...esperado].sort())
    }
  })

  it("no hay operaciones esperadas que se hayan quedado sin implementar", () => {
    const implementadas = new Set(OPERACIONES_ESCRITURA.map((o) => o.nombre))
    for (const nombre of Object.keys(PERMISOS_ESPERADOS)) {
      expect(implementadas.has(nombre), `falta la operación "${nombre}"`).toBe(true)
    }
  })

  it("ninguna operación admite el rol consulta", () => {
    for (const operacion of OPERACIONES_ESCRITURA) {
      expect(operacion.roles as string[], `"${operacion.nombre}" no debe admitir consulta`).not.toContain("consulta")
    }
  })

  it("las operaciones destructivas exigen confirmación reforzada y son solo de admin", () => {
    const destructivas = OPERACIONES_ESCRITURA.filter((o) => o.riesgo === "destructiva")
    expect(destructivas.length).toBeGreaterThan(0)
    for (const operacion of destructivas) {
      expect(operacion.roles, `"${operacion.nombre}" destructiva`).toEqual(["admin"])
    }
  })

  it("registra las herramientas de borrador y confirmación", () => {
    const registerTool = vi.fn()
    registerEscrituraTools({ registerTool } as unknown as McpServer)

    const nombres = registerTool.mock.calls.map(([nombre]) => nombre)
    expect(nombres).toContain("confirmar_operacion")
    expect(nombres).toContain("cancelar_operacion")
    // Una herramienta preparar_* por operación, más las dos de control.
    expect(nombres.length).toBe(OPERACIONES_ESCRITURA.length + 2)
  })
})
