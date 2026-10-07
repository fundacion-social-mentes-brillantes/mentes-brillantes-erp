import { z } from "zod"
import {
  previsualizarReversoAbono,
  previsualizarReversoAnticipo,
  revertirAbonoConSaldo,
  revertirAnticipo,
  corregirMontoPago,
  pagarDeudasConSaldo,
  previsualizarCorreccionMonto,
  previsualizarPagarDeudasConSaldo,
} from "@/lib/operaciones/saldo-favor"
import {
  TIPOS_ANULABLES,
  TIPOS_EDITABLES,
  type EditarMovimientoParams,
  anularMovimiento,
  editarMovimiento,
  eliminarMovimiento,
  previsualizarAnulacion,
  previsualizarEdicion,
  previsualizarEliminacion,
} from "@/lib/operaciones/anulaciones"
import {
  editarValorCuenta,
  eliminarCuenta,
  previsualizarEdicionValorCuenta,
  previsualizarEliminacionCuenta,
} from "@/lib/operaciones/cuentas"
import {
  money,
  operacion,
  resolverPersona,
  type DefinicionOperacion,
} from "./comun"

// Correcciones de lo ya registrado: anular, borrar, editar, revertir y corregir montos.
// Cada una sigue el camino preparar -> confirmar de escritura-tools.ts.

export const OPERACIONES_CORRECCIONES: DefinicionOperacion[] = [
  operacion({
    nombre: "anular_movimiento",
    titulo: "Anular un movimiento",
    descripcion:
      "Marca como ANULADO un pago, egreso, donacion o venta externa mal registrado. No lo borra: queda el rastro. " +
      "Es la forma correcta de corregir un error. Los pagos hechos con saldo a favor y los que generaron sobrepago " +
      "no se pueden anular por aqui.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      tipo: z.enum(TIPOS_ANULABLES),
      movimiento_id: z.string().uuid().describe("Id del movimiento a anular"),
    },
    previsualizar: async (admin, _actor, args) => {
      const datos = { tipo: args.tipo, movimientoId: args.movimiento_id }
      const previa = await previsualizarAnulacion(admin, datos)
      return {
        datos,
        resumen: `ANULAR: ${previa.descripcion} por ${money(previa.monto)} del ${previa.fecha}`,
        detalle: {
          tipo: previa.tipo,
          descripcion: previa.descripcion,
          monto: previa.monto,
          fecha: previa.fecha,
          efecto: previa.efecto,
        },
        avisos: [
          "Esta operacion cambia cifras ya registradas. Confirma con el usuario que es el movimiento correcto.",
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await anularMovimiento(admin, { userId: actor.userId, role: actor.role }, d)
      return { anulado: r.tipo, movimiento_id: r.movimientoId, monto_anulado: r.montoAnulado }
    },
  }),

  operacion({
    nombre: "eliminar_movimiento",
    titulo: "Eliminar un movimiento (borrado definitivo)",
    descripcion:
      "BORRA por completo un pago, egreso, donacion o venta externa. No queda rastro del registro. Usala solo para " +
      "deshacer algo creado por error hace un momento; para corregir historia lo correcto es anular_movimiento.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      tipo: z.enum(TIPOS_ANULABLES),
      movimiento_id: z.string().uuid(),
    },
    previsualizar: async (admin, _actor, args) => {
      const datos = { tipo: args.tipo, movimientoId: args.movimiento_id }
      const previa = await previsualizarEliminacion(admin, datos)
      return {
        datos,
        resumen: `ELIMINAR DEFINITIVAMENTE: ${previa.descripcion} por ${money(previa.monto)} del ${previa.fecha}`,
        detalle: {
          tipo: previa.tipo,
          descripcion: previa.descripcion,
          monto: previa.monto,
          fecha: previa.fecha,
          efecto: previa.efecto,
        },
        avisos: [
          "El borrado es IRREVERSIBLE y no deja rastro del registro. Si solo quieres corregir un error del pasado, " +
            "es mejor anular_movimiento, que conserva el historial.",
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await eliminarMovimiento(admin, { userId: actor.userId, role: actor.role }, d)
      return { eliminado: r.tipo, movimiento_id: r.movimientoId, monto_eliminado: r.montoEliminado }
    },
  }),

  operacion({
    nombre: "editar_movimiento",
    titulo: "Corregir un egreso, donacion o venta externa",
    descripcion:
      "Cambia el monto, la fecha, el concepto o las notas de un egreso, donacion o venta externa ya registrado. " +
      "El monto de un abono NO se corrige por aqui (debe hacerse en el detalle de la cuenta para no romper el saldo a favor).",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      tipo: z.enum(TIPOS_EDITABLES),
      movimiento_id: z.string().uuid(),
      monto: z.coerce.number().positive().max(100_000_000).optional(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      concepto: z.string().trim().min(2).max(200).optional(),
      notas: z.string().trim().max(300).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      // Solo viajan los campos indicados (undefined = no se toca).
      const datos: EditarMovimientoParams = {
        tipo: args.tipo,
        movimientoId: args.movimiento_id,
        ...(args.monto !== undefined ? { monto: args.monto } : {}),
        ...(args.fecha !== undefined ? { fecha: args.fecha } : {}),
        ...(args.concepto !== undefined ? { concepto: args.concepto } : {}),
        ...(args.notas !== undefined ? { notas: args.notas } : {}),
      }

      const previa = await previsualizarEdicion(admin, datos)
      const cambios = Object.entries(previa.cambios)
        .map(([campo, v]) => `${campo}: ${v.antes} -> ${v.despues}`)
        .join(", ")

      return {
        datos,
        resumen: `CORREGIR ${previa.descripcion} (${cambios})`,
        detalle: { tipo: previa.tipo, descripcion: previa.descripcion, cambios: previa.cambios },
        avisos: ["Cambia cifras ya registradas: verifica que los valores nuevos sean los correctos."],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await editarMovimiento(admin, { userId: actor.userId, role: actor.role }, d)
      return { editado: r.tipo, movimiento_id: r.movimientoId, cambios: r.cambios }
    },
  }),

  operacion({
    nombre: "editar_valor_cuenta",
    titulo: "Corregir el valor de una cuenta",
    descripcion:
      "Cambia cuanto se le cobra a una persona por un concepto. Recalcula el estado de la cuenta. " +
      "No se puede dejar en 0 si ya tiene abonos activos.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      cuenta_id: z.string().uuid(),
      valor_nuevo: z.coerce.number().min(0).max(100_000_000),
      motivo: z.string().trim().max(300).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      const datos = {
        cuentaId: String(args.cuenta_id),
        valorNuevo: Number(args.valor_nuevo),
        motivo: args.motivo ? String(args.motivo) : null,
      }
      const previa = await previsualizarEdicionValorCuenta(admin, datos)
      return {
        datos,
        resumen:
          `CORREGIR el valor de "${previa.concepto}" de ${previa.personaNombre}: ` +
          `${money(previa.valorAntes)} -> ${money(previa.valorDespues)}`,
        detalle: {
          persona: previa.personaNombre,
          concepto: previa.concepto,
          valor_antes: previa.valorAntes,
          valor_despues: previa.valorDespues,
          estado_antes: previa.estadoAntes,
          estado_despues: previa.estadoDespues,
        },
        avisos: ["Cambia lo que la persona debe. Verifica el valor nuevo con el usuario."],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await editarValorCuenta(admin, { userId: actor.userId, role: actor.role }, d)
      return { cuenta_id: r.cuentaId, valor_antes: r.valorAntes, valor_despues: r.valorDespues, estado: r.estadoDespues }
    },
  }),

  operacion({
    nombre: "eliminar_cuenta",
    titulo: "Eliminar una cuenta por cobrar",
    descripcion:
      "Borra una cuenta creada por error. Solo procede si no tiene pagos validos, ni saldo a favor aplicado, " +
      "ni sesiones coach ya dictadas.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: { cuenta_id: z.string().uuid() },
    previsualizar: async (admin, _actor, args) => {
      const datos = { cuentaId: String(args.cuenta_id) }
      const previa = await previsualizarEliminacionCuenta(admin, datos.cuentaId)
      return {
        datos,
        resumen: `ELIMINAR la cuenta "${previa.concepto}" de ${previa.personaNombre} por ${money(previa.valorTotal)}`,
        detalle: {
          persona: previa.personaNombre,
          concepto: previa.concepto,
          valor_total: previa.valorTotal,
          fecha_emision: previa.fechaEmision,
          efecto: previa.efecto,
        },
        avisos: ["El borrado es IRREVERSIBLE."],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await eliminarCuenta(admin, { userId: actor.userId, role: actor.role }, String(d.cuentaId))
      return { cuenta_id: r.cuentaId, concepto: r.concepto, valor_total: r.valorTotal }
    },
  }),

  operacion({
    nombre: "revertir_abono",
    titulo: "Revertir un abono con sobrepago",
    descripcion:
      "Anula un abono que genero saldo a favor por sobrepago, revirtiendo tambien ese saldo en una sola operacion " +
      "atomica. Es el flujo correcto cuando anular_movimiento se niega por sobrepago.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      cuenta_id: z.string().uuid(),
      abono_id: z.string().uuid(),
    },
    previsualizar: async (admin, _actor, args) => {
      const datos = { cuentaId: String(args.cuenta_id), abonoId: String(args.abono_id) }
      const previa = await previsualizarReversoAbono(admin, datos)
      return {
        datos,
        resumen:
          `REVERTIR el abono de ${money(previa.monto)} de ${previa.personaNombre} ` +
          `en "${previa.concepto}" (${previa.fecha})`,
        detalle: {
          persona: previa.personaNombre,
          concepto: previa.concepto,
          monto: previa.monto,
          fecha: previa.fecha,
          efecto: previa.efecto,
        },
        avisos: ["Revierte el pago Y el saldo a favor que genero. La deuda vuelve a subir."],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await revertirAbonoConSaldo(admin, { userId: actor.userId, role: actor.role }, d)
      return { abono_id: r.abonoId, monto_revertido: r.montoRevertido }
    },
  }),

  operacion({
    nombre: "revertir_anticipo",
    titulo: "Revertir un anticipo",
    descripcion:
      "Anula un anticipo (saldo a favor que la persona habia entregado) y lo descuenta de su saldo disponible. " +
      "Solo procede si ese saldo no se ha consumido ya.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      persona: z.string().trim().min(1).max(160),
      anticipo_id: z.string().uuid(),
    },
    previsualizar: async (admin, _actor, args) => {
      const persona = await resolverPersona(admin, String(args.persona))
      const datos = { asistenteId: persona.id, anticipoId: String(args.anticipo_id) }
      const previa = await previsualizarReversoAnticipo(admin, datos)
      return {
        datos,
        resumen: `REVERTIR el anticipo de ${money(previa.monto)} de ${persona.nombre} (${previa.fecha})`,
        detalle: {
          persona: persona.nombre,
          monto_original: previa.monto,
          monto_que_se_revierte: previa.montoNormalizado,
          saldo_disponible_antes: previa.disponible,
          saldo_disponible_despues: previa.saldoDespues,
          efecto: previa.efecto,
        },
        avisos: [
          previa.montoNormalizado !== previa.monto
            ? `El reverso se hace por ${money(previa.montoNormalizado)} (multiplo de 50), no por ${money(previa.monto)}.`
            : null,
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await revertirAnticipo(admin, { userId: actor.userId, role: actor.role }, d)
      return { anticipo_id: r.anticipoId, monto_revertido: r.montoRevertido, saldo_despues: r.saldoDespues }
    },
  }),

  operacion({
    nombre: "corregir_monto_pago",
    titulo: "Corregir el monto de un pago",
    descripcion:
      "Cambia el monto de un pago ya registrado. Internamente hace lo contablemente correcto: anula el pago actual " +
      "(y el saldo a favor que hubiera generado) y registra uno nuevo con el monto correcto, en la misma fecha y " +
      "con el mismo metodo. Queda el rastro de ambos.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      cuenta_id: z.string().uuid(),
      abono_id: z.string().uuid(),
      monto_nuevo: z.coerce.number().positive().max(100_000_000),
    },
    previsualizar: async (admin, _actor, args) => {
      const datos = {
        cuentaId: String(args.cuenta_id),
        abonoId: String(args.abono_id),
        montoNuevo: Number(args.monto_nuevo),
      }
      const previa = await previsualizarCorreccionMonto(admin, datos)
      return {
        datos,
        resumen:
          `CORREGIR el pago de ${previa.personaNombre} en "${previa.concepto}": ` +
          `${money(previa.montoAntes)} -> ${money(previa.montoDespues)}`,
        detalle: {
          persona: previa.personaNombre,
          concepto: previa.concepto,
          fecha: previa.fecha,
          monto_antes: previa.montoAntes,
          monto_despues: previa.montoDespues,
          como_se_hace: previa.efecto,
        },
        avisos: ["Se anula el pago original y se crea uno nuevo: en el historial apareceran los dos."],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await corregirMontoPago(admin, { userId: actor.userId, role: actor.role }, d)
      return {
        pago_anulado: r.abonoAnulado,
        pago_nuevo: r.pagoNuevoId,
        monto_antes: r.montoAntes,
        monto_despues: r.montoDespues,
        excedente_a_saldo_a_favor: r.excedenteASaldoFavor,
        estado_de_la_cuenta: r.estadoDeLaCuenta,
      }
    },
  }),

  operacion({
    nombre: "pagar_deudas_con_saldo",
    titulo: "Aplicar el saldo a favor a todas las deudas",
    descripcion:
      "Usa el saldo a favor disponible de una persona para ir pagando sus cuentas pendientes, de la mas antigua a " +
      "la mas nueva. Cada aplicacion se ajusta a multiplos de 50 pesos.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: { persona: z.string().trim().min(1).max(160) },
    previsualizar: async (admin, _actor, args) => {
      const persona = await resolverPersona(admin, String(args.persona))
      const previa = await previsualizarPagarDeudasConSaldo(admin, persona.id)
      return {
        datos: { asistenteId: persona.id },
        resumen:
          `Aplicar ${money(previa.totalAplicado)} del saldo a favor de ${persona.nombre} ` +
          `a ${previa.plan.length} cuenta(s)`,
        detalle: {
          persona: persona.nombre,
          saldo_disponible: previa.disponible,
          se_aplicara: previa.plan.map((p) => ({
            concepto: p.concepto,
            pendiente: p.pendiente,
            se_aplica: p.seAplica,
          })),
          total_aplicado: previa.totalAplicado,
          saldo_despues: previa.saldoDespues,
        },
        avisos: [
          previa.saldoDespues > 0
            ? `Quedaran ${money(previa.saldoDespues)} de saldo a favor sin aplicar.`
            : null,
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await pagarDeudasConSaldo(
        admin,
        { userId: actor.userId, role: actor.role },
        String(d.asistenteId)
      )
      return {
        cuentas_pagadas: r.aplicadas.length,
        total_aplicado: r.totalAplicado,
        detalle: r.aplicadas,
        parcial: r.parcial,
        motivo: r.motivo,
      }
    },
  }),
]
