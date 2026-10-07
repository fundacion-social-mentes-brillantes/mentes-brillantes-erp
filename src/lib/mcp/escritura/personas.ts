import { z } from "zod"
import { fechaHoyBogota } from "@/lib/utils/fechas"
import {
  cambiarEstadoPersona,
  crearPersona,
  editarPersona,
  eliminarPersona,
  previsualizarEdicionPersona,
  previsualizarEliminacionPersona,
  siguienteCodigoPersona,
  type CambiosPersona,
} from "@/lib/operaciones/personas"
import { OperacionMcpError } from "../operaciones"
import {
  FECHA,
  enmascarar,
  operacion,
  resolverPersona,
  type DefinicionOperacion,
} from "./comun"

// Personas (asistentes): crear, corregir, activar/desactivar y borrar.
// Cada una sigue el camino preparar -> confirmar de escritura-tools.ts.

export const OPERACIONES_PERSONAS: DefinicionOperacion[] = [
  operacion({
    nombre: "persona",
    titulo: "Registrar una persona nueva",
    descripcion:
      "Da de alta a una persona (asistente) en el ERP. Necesario antes de poder cobrarle o registrarle pagos. " +
      "Si no indicas codigo, se le asigna el siguiente libre (el mismo que propone la web), porque el codigo es lo " +
      "que la une con la agenda. La fecha de registro es hoy salvo que un admin indique otra.",
    roles: ["admin", "caja"],
    riesgo: "crear",
    schema: {
      nombre: z.string().trim().min(3).max(160),
      cedula: z.string().trim().max(40).optional(),
      correo: z.string().trim().email().max(160).optional(),
      telefono: z.string().trim().max(40).optional(),
      codigo: z.string().trim().max(40).optional().describe("Si se omite, se asigna el siguiente codigo libre"),
      fecha_registro: FECHA.optional().describe("Solo admin. Por defecto, hoy"),
      fecha_inicio_proceso: FECHA.optional().describe("Solo admin. Si se omite, se llena sola con la primera sesion coach"),
    },
    previsualizar: async (admin, actor, args) => {
      const nombre = String(args.nombre).trim()
      if ((args.fecha_registro || args.fecha_inicio_proceso) && actor.role !== "admin") {
        throw new OperacionMcpError("Solo un administrador puede fijar las fechas de registro o de inicio de proceso.")
      }
      const codigoAsignado = !args.codigo
      const datos = {
        nombre,
        cedula: args.cedula ? String(args.cedula).trim() : null,
        correo: args.correo ? String(args.correo).trim() : null,
        telefono: args.telefono ? String(args.telefono).trim() : null,
        codigo: args.codigo ? String(args.codigo).trim() : await siguienteCodigoPersona(admin),
        // Sin fecha, crearPersona pone la de hoy (para cualquier rol).
        fechaRegistro: args.fecha_registro ? String(args.fecha_registro) : null,
        fechaInicioProceso: args.fecha_inicio_proceso ? String(args.fecha_inicio_proceso) : null,
      }

      const { data: mismoCodigo } = await admin
        .from("asistentes")
        .select("nombre")
        .eq("codigo", datos.codigo)
        .limit(1)
      if (mismoCodigo?.length) {
        throw new OperacionMcpError(
          `El codigo ${datos.codigo} ya es de ${mismoCodigo[0].nombre}. Usa otro o deja que se asigne solo.`
        )
      }

      // Aviso de posible homonimo o alta repetida.
      const { data: parecidos } = await admin
        .from("asistentes")
        .select("nombre, codigo")
        .ilike("nombre", `%${nombre}%`)
        .limit(5)

      return {
        datos,
        resumen: `Registrar a ${nombre} como persona nueva, con el codigo ${datos.codigo}`,
        detalle: {
          nombre,
          codigo: datos.codigo,
          codigo_asignado_automaticamente: codigoAsignado,
          // Enmascarados: el filtro de privacidad del MCP no deja salir estos datos completos.
          identificacion: enmascarar(datos.cedula),
          contacto_mail: enmascarar(datos.correo),
          contacto_movil: enmascarar(datos.telefono),
          fecha_registro: datos.fechaRegistro ?? fechaHoyBogota(),
          fecha_inicio_proceso: datos.fechaInicioProceso ?? "se llena sola con la primera sesion coach",
        },
        avisos: [
          parecidos && parecidos.length
            ? `Ya hay personas con nombre parecido: ${parecidos
                .map((p) => `${p.nombre} (${p.codigo})`)
                .join(", ")}. Verifica que no sea la misma.`
            : null,
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await crearPersona(admin, { userId: actor.userId, role: actor.role }, d)
      return { asistente_id: r.id, nombre: r.nombre, codigo: r.codigo, fecha_registro: r.fechaRegistro }
    },
  }),

  operacion({
    nombre: "editar_persona",
    titulo: "Editar los datos de una persona",
    descripcion:
      "Corrige nombre, cedula, correo, telefono, codigo o (solo admin) las fechas de registro e inicio de proceso. " +
      "Manda SOLO los campos que cambian: lo que no mandes queda como esta. Para borrar un dato, mandalo vacio (\"\").",
    roles: ["admin", "caja"],
    riesgo: "editar",
    schema: {
      persona: z.string().trim().min(1).max(160).describe("Persona a editar (nombre o codigo actual)"),
      nombre: z.string().trim().min(3).max(160).optional(),
      cedula: z.string().trim().max(40).optional(),
      correo: z.union([z.literal(""), z.string().trim().email().max(160)]).optional(),
      telefono: z.string().trim().max(40).optional(),
      codigo: z.string().trim().max(40).optional(),
      fecha_registro: z.union([z.literal(""), FECHA]).optional().describe("Solo admin"),
      fecha_inicio_proceso: z.union([z.literal(""), FECHA]).optional().describe("Solo admin"),
    },
    previsualizar: async (admin, actor, args) => {
      const actual = await resolverPersona(admin, String(args.persona))
      const cambios: CambiosPersona = {
        ...(args.nombre !== undefined ? { nombre: args.nombre } : {}),
        ...(args.cedula !== undefined ? { cedula: args.cedula } : {}),
        ...(args.correo !== undefined ? { correo: args.correo } : {}),
        ...(args.telefono !== undefined ? { telefono: args.telefono } : {}),
        ...(args.codigo !== undefined ? { codigo: args.codigo } : {}),
        ...(args.fecha_registro !== undefined ? { fechaRegistro: args.fecha_registro } : {}),
        ...(args.fecha_inicio_proceso !== undefined ? { fechaInicioProceso: args.fecha_inicio_proceso } : {}),
      }

      const previa = await previsualizarEdicionPersona(
        admin,
        { userId: actor.userId, role: actor.role },
        actual.id,
        cambios
      )

      // Los datos de contacto se muestran enmascarados: el filtro de privacidad
      // del MCP no deja salir cedulas, correos ni telefonos completos.
      const ETIQUETA: Record<string, string> = {
        nombre: "nombre",
        codigo: "codigo",
        cedula: "identificacion",
        correo: "contacto_mail",
        telefono: "contacto_movil",
        fechaRegistro: "fecha_registro",
        fechaInicioProceso: "fecha_inicio_proceso",
      }
      const SENSIBLE = new Set(["cedula", "correo", "telefono"])
      const visibles = Object.fromEntries(
        Object.entries(previa.cambios).map(([campo, c]) => [
          ETIQUETA[campo] || campo,
          SENSIBLE.has(campo)
            ? { antes: enmascarar(c.antes), despues: enmascarar(c.despues) }
            : { antes: c.antes ?? "(vacio)", despues: c.despues ?? "(vacio)" },
        ])
      )

      return {
        datos: { asistenteId: actual.id, ...cambios },
        resumen:
          `Actualizar ${Object.keys(visibles).join(", ")} de ${previa.nombreActual} ` +
          `(codigo ${previa.codigoActual ?? "sin codigo"})`,
        detalle: { persona: previa.nombreActual, cambios: visibles, lo_demas: "queda igual" },
        avisos: [
          previa.cambios.codigo
            ? "Cambia el codigo: es lo que une a la persona con la agenda. Verifica que la agenda use el mismo."
            : null,
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const { asistenteId, ...cambios } = d
      const r = await editarPersona(admin, { userId: actor.userId, role: actor.role }, asistenteId, cambios)
      return { asistente_id: r.id, nombre: r.nombre, campos_cambiados: r.camposCambiados }
    },
  }),

  operacion({
    nombre: "estado_persona_activa",
    titulo: "Activar o desactivar una persona",
    descripcion:
      "Marca a una persona como activa o inactiva. No borra nada: es la forma recomendada de retirar a alguien " +
      "que ya no participa, conservando su historial.",
    roles: ["admin"],
    riesgo: "editar",
    schema: {
      persona: z.string().trim().min(1).max(160),
      activo: z.boolean(),
    },
    previsualizar: async (admin, _actor, args) => {
      const persona = await resolverPersona(admin, String(args.persona))
      const activo = Boolean(args.activo)
      const datos = { asistenteId: persona.id, activo }
      return {
        datos,
        resumen: `${activo ? "Activar" : "Desactivar"} a ${persona.nombre}`,
        detalle: { persona: persona.nombre, codigo: persona.codigo, quedara: activo ? "activa" : "inactiva" },
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await cambiarEstadoPersona(
        admin,
        { userId: actor.userId, role: actor.role },
        String(d.asistenteId),
        Boolean(d.activo)
      )
      return { asistente_id: r.id, activo: r.activo }
    },
  }),

  operacion({
    nombre: "eliminar_persona",
    titulo: "Eliminar una persona",
    descripcion:
      "Borra a una persona del ERP. Solo procede si NO tiene cuentas registradas. Si ya participo alguna vez, " +
      "lo correcto es desactivarla para conservar su historial.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: { persona: z.string().trim().min(1).max(160) },
    previsualizar: async (admin, _actor, args) => {
      const persona = await resolverPersona(admin, String(args.persona))
      const previa = await previsualizarEliminacionPersona(admin, persona.id)
      return {
        datos: { asistenteId: persona.id },
        resumen: `ELIMINAR a ${previa.nombre} del ERP`,
        detalle: { persona: previa.nombre, codigo: previa.codigo },
        avisos: ["El borrado es IRREVERSIBLE. Si tiene historial, es mejor desactivarla."],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await eliminarPersona(admin, { userId: actor.userId, role: actor.role }, String(d.asistenteId))
      return { asistente_id: r.asistenteId, nombre: r.nombre }
    },
  }),
]
