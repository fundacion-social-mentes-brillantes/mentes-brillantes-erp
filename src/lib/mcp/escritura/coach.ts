import { z } from "zod"
import { fechaHoyBogota } from "@/lib/utils/fechas"
import {
  editarSesionCoach,
  eliminarSesionCoach,
  previsualizarEdicionSesion,
  previsualizarEliminacionSesion,
  previsualizarSesionCoach,
  registrarSesionCoach,
} from "@/lib/operaciones/coach"
import {
  operacion,
  resolverPersona,
  type DefinicionOperacion,
} from "./comun"

// Sesiones coach: registrar, corregir y borrar.
// Cada una sigue el camino preparar -> confirmar de escritura-tools.ts.

export const OPERACIONES_COACH: DefinicionOperacion[] = [
  operacion({
    nombre: "sesion_coach",
    titulo: "Registrar una sesion coach",
    descripcion:
      "Registra una sesion de coach realizada. Descuenta del paquete mas antiguo que tenga cupo disponible.",
    roles: ["admin", "caja"],
    schema: {
      persona: z.string().trim().min(1).max(160),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      notas: z.string().trim().max(300).optional(),
      evento_agenda_id: z
        .string()
        .trim()
        .max(128)
        .optional()
        .describe("Evento de la agenda del que sale la sesion, para poder seguirle el rastro si lo borran alla."),
    },
    previsualizar: async (admin, _actor, args) => {
      const persona = await resolverPersona(admin, String(args.persona))
      const datos = {
        asistenteId: persona.id,
        fecha: String(args.fecha || fechaHoyBogota()),
        notas: args.notas ? String(args.notas) : null,
        eventoAgendaId: args.evento_agenda_id ? String(args.evento_agenda_id) : null,
      }
      const previa = await previsualizarSesionCoach(admin, datos)

      return {
        datos,
        resumen: `Registrar sesion coach de ${persona.nombre} el ${previa.fecha}`,
        detalle: {
          persona: persona.nombre,
          fecha: previa.fecha,
          sesiones_compradas: previa.compradas,
          sesiones_realizadas: previa.realizadas,
          restantes_antes: previa.restantesAntes,
          restantes_despues: previa.restantesDespues,
          se_descuenta_de: previa.paquete.compradoEl
            ? `${previa.paquete.concepto || "paquete"} comprado el ${previa.paquete.compradoEl}`
            : "el paquete disponible mas antiguo",
        },
        avisos: [
          previa.restantesDespues === 0 ? "Con esta sesion se agota el paquete de la persona." : null,
          // Consumir un credito viejo es correcto (se gasta primero lo mas
          // antiguo), pero conviene decirlo: significa que la persona ya tenia
          // una sesion pagada sin usar, o que esa sesion vieja nunca se registro.
          previa.paquete.diasDeAntiguedad !== null && previa.paquete.diasDeAntiguedad > 45
            ? `OJO: se descuenta de un cupo comprado hace ${previa.paquete.diasDeAntiguedad} dias (${previa.paquete.compradoEl}), no de la compra mas reciente. Se gasta primero el credito mas antiguo. Revisa si esa sesion vieja quedo sin registrar.`
            : null,
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await registrarSesionCoach(admin, { userId: actor.userId, role: actor.role }, d)
      return { fecha: r.fecha, sesiones_restantes: r.restantesDespues }
    },
  }),

  operacion({
    nombre: "editar_sesion_coach",
    titulo: "Corregir una sesion coach",
    descripcion: "Cambia la fecha o las notas de una sesion coach ya registrada.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      sesion_id: z.string().uuid(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      notas: z.string().trim().max(300).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      const datos = {
        sesionId: args.sesion_id,
        ...(args.fecha !== undefined ? { fecha: args.fecha } : {}),
        ...(args.notas !== undefined ? { notas: args.notas } : {}),
      }
      const previa = await previsualizarEdicionSesion(admin, datos)
      return {
        datos,
        resumen: `CORREGIR la sesion coach de ${previa.personaNombre} del ${previa.fechaActual}`,
        detalle: { persona: previa.personaNombre, cambios: previa.cambios },
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await editarSesionCoach(admin, { userId: actor.userId, role: actor.role }, d)
      return { sesion_id: r.sesionId, cambios: r.cambios }
    },
  }),

  operacion({
    nombre: "eliminar_sesion_coach",
    titulo: "Eliminar una sesion coach",
    descripcion:
      "Borra una sesion coach registrada por error. La sesion vuelve a quedar disponible en el paquete de la persona.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: { sesion_id: z.string().uuid() },
    previsualizar: async (admin, _actor, args) => {
      const datos = { sesionId: String(args.sesion_id) }
      const previa = await previsualizarEliminacionSesion(admin, datos.sesionId)
      return {
        datos,
        resumen: `ELIMINAR la sesion coach de ${previa.personaNombre} del ${previa.fecha}`,
        detalle: { persona: previa.personaNombre, fecha: previa.fecha, efecto: previa.efecto },
        avisos: ["El borrado es IRREVERSIBLE."],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await eliminarSesionCoach(admin, { userId: actor.userId, role: actor.role }, String(d.sesionId))
      return { sesion_id: r.sesionId, persona: r.personaNombre, fecha: r.fecha }
    },
  }),
]
