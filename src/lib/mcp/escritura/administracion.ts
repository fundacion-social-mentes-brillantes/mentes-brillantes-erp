import { z } from "zod"
import { exigirMontoPositivo } from "@/lib/operaciones/errores"
import {
  buscarSocio,
  cambiarEstadoSocio,
  cerrarLiquidacion,
  crearAdelanto,
  crearDevolucionAdelanto,
  crearDevolucionSocio,
  planearDevolucionSocio,
  crearPeriodo,
  crearSocio,
  cambiarFechaFinPeriodo,
  editarSocio,
  porcentajeTotalSocios,
  validarAdelanto,
  validarDevolucionAdelanto,
  validarCambioFechaFin,
  validarCierreLiquidacion,
  validarPeriodoNuevo,
} from "@/lib/operaciones/administracion"
import {
  actualizarConfiguracionEmpresa,
  previsualizarConfiguracionEmpresa,
} from "@/lib/operaciones/configuracion"
import { OperacionMcpError } from "../operaciones"
import {
  METODOS_PAGO,
  money,
  operacion,
  type DefinicionOperacion,
  type DatosDevolucion,
} from "./comun"

// Administracion: socios, periodos, adelantos, devoluciones, cierre de liquidacion y datos de la fundacion.
// Cada una sigue el camino preparar -> confirmar de escritura-tools.ts.

export const OPERACIONES_ADMINISTRACION: DefinicionOperacion[] = [
  operacion({
    nombre: "socio",
    titulo: "Registrar un socio",
    descripcion: "Da de alta un socio con su porcentaje de participacion en las liquidaciones.",
    roles: ["admin"],
    riesgo: "crear",
    schema: {
      nombre: z.string().trim().min(3).max(160),
      porcentaje: z.coerce.number().min(0).max(100),
    },
    previsualizar: async (admin, _actor, args) => {
      const datos = { nombre: String(args.nombre).trim(), porcentaje: Number(args.porcentaje) }
      const totalActual = await porcentajeTotalSocios(admin)
      const total = totalActual + datos.porcentaje
      return {
        datos,
        resumen: `Registrar al socio ${datos.nombre} con ${datos.porcentaje}% de participacion`,
        detalle: {
          nombre: datos.nombre,
          porcentaje: datos.porcentaje,
          porcentaje_actual_de_socios_activos: totalActual,
          porcentaje_total_quedaria: total,
        },
        avisos: [total > 100 ? `OJO: la suma de participaciones quedaria en ${total}%, por encima de 100%.` : null],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await crearSocio(admin, { userId: actor.userId, role: actor.role }, d)
      return { socio_id: r.id, nombre: r.nombre, porcentaje: r.porcentaje }
    },
  }),

  operacion({
    nombre: "editar_socio",
    titulo: "Editar un socio",
    descripcion: "Cambia el nombre o el porcentaje de participacion de un socio.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      socio: z.string().trim().min(2).max(160).describe("Nombre actual del socio"),
      nombre: z.string().trim().min(3).max(160).optional().describe("Si se omite, queda el actual"),
      porcentaje: z.coerce.number().min(0).max(100).optional().describe("Si se omite, queda el actual"),
    },
    previsualizar: async (admin, _actor, args) => {
      const socio = await buscarSocio(admin, String(args.socio))
      if (args.nombre === undefined && args.porcentaje === undefined) {
        throw new OperacionMcpError("Indica el nombre nuevo, el porcentaje nuevo o ambos.")
      }
      const datos = {
        socioId: socio.id,
        nombre: args.nombre !== undefined ? String(args.nombre).trim() : String(socio.nombre),
        porcentaje: args.porcentaje !== undefined ? Number(args.porcentaje) : Number(socio.porcentaje_participacion),
      }
      const totalOtros = await porcentajeTotalSocios(admin, socio.id)
      const total = totalOtros + datos.porcentaje
      return {
        datos,
        resumen: `Editar al socio ${socio.nombre}: ${socio.porcentaje_participacion}% -> ${datos.porcentaje}%`,
        detalle: {
          antes: { nombre: socio.nombre, porcentaje: socio.porcentaje_participacion },
          despues: { nombre: datos.nombre, porcentaje: datos.porcentaje },
          porcentaje_total_quedaria: total,
        },
        avisos: [
          total > 100 ? `OJO: la suma de participaciones quedaria en ${total}%, por encima de 100%.` : null,
          "Cambia como se reparte el dinero en las proximas liquidaciones.",
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const { socioId, ...datos } = d
      const r = await editarSocio(admin, { userId: actor.userId, role: actor.role }, socioId, datos)
      return { socio_id: r.id, nombre: r.nombre, porcentaje: r.porcentaje }
    },
  }),

  operacion({
    nombre: "estado_socio_activo",
    titulo: "Activar o desactivar un socio",
    descripcion:
      "Marca un socio como activo o inactivo. Un socio inactivo deja de recibir reparto en las liquidaciones.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      socio: z.string().trim().min(2).max(160),
      activo: z.boolean(),
    },
    previsualizar: async (admin, _actor, args) => {
      const socio = await buscarSocio(admin, String(args.socio))
      const activo = Boolean(args.activo)
      return {
        datos: { socioId: socio.id, activo },
        resumen: `${activo ? "Activar" : "Desactivar"} al socio ${socio.nombre}`,
        detalle: { socio: socio.nombre, porcentaje: socio.porcentaje_participacion, quedara: activo ? "activo" : "inactivo" },
        avisos: [!activo ? "Un socio inactivo NO recibe reparto al cerrar la liquidacion." : null],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await cambiarEstadoSocio(
        admin,
        { userId: actor.userId, role: actor.role },
        String(d.socioId),
        Boolean(d.activo)
      )
      return { socio_id: r.id, activo: r.activo }
    },
  }),

  operacion({
    nombre: "periodo",
    titulo: "Abrir un periodo contable",
    descripcion:
      "Crea un periodo (quincena) nuevo. Solo puede haber UN periodo abierto a la vez y no puede solaparse con otro.",
    roles: ["admin"],
    riesgo: "crear",
    schema: {
      nombre: z.string().trim().min(3).max(120),
      fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    },
    previsualizar: async (admin, _actor, args) => {
      const datos = {
        nombre: String(args.nombre).trim(),
        fechaInicio: String(args.fecha_inicio),
        fechaFin: String(args.fecha_fin),
      }
      await validarPeriodoNuevo(admin, datos)
      return {
        datos,
        resumen: `Abrir el periodo "${datos.nombre}" del ${datos.fechaInicio} al ${datos.fechaFin}`,
        detalle: { nombre: datos.nombre, desde: datos.fechaInicio, hasta: datos.fechaFin, estado: "abierto" },
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await crearPeriodo(admin, { userId: actor.userId, role: actor.role }, d)
      return { periodo_id: r.id, nombre: r.nombre, desde: r.fechaInicio, hasta: r.fechaFin }
    },
  }),

  operacion({
    nombre: "fecha_fin_periodo",
    titulo: "Mover la fecha de fin de un periodo",
    descripcion:
      "Alarga o acorta el periodo abierto. No puede solaparse con otro periodo ni dejar adelantos fuera del rango.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: {
      periodo_id: z.string().uuid(),
      nueva_fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    },
    previsualizar: async (admin, _actor, args) => {
      const datos = { periodoId: String(args.periodo_id), nuevaFechaFin: String(args.nueva_fecha_fin) }
      const v = await validarCambioFechaFin(admin, datos.periodoId, datos.nuevaFechaFin)
      return {
        datos,
        resumen: `Mover el fin de "${v.periodo.nombre}": ${v.periodo.fecha_fin} -> ${v.fin}`,
        detalle: { periodo: v.periodo.nombre, desde: v.periodo.fecha_inicio, fin_antes: v.periodo.fecha_fin, fin_despues: v.fin },
        avisos: ["Cambia que movimientos entran en la liquidacion de este periodo."],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await cambiarFechaFinPeriodo(
        admin,
        { userId: actor.userId, role: actor.role },
        String(d.periodoId),
        String(d.nuevaFechaFin)
      )
      return { periodo_id: r.periodoId, nombre: r.nombre, fin_antes: r.fechaFinAntes, fin_despues: r.fechaFinDespues }
    },
  }),

  operacion({
    nombre: "adelanto_socio",
    titulo: "Registrar un adelanto a un socio",
    descripcion:
      "Registra dinero entregado a un socio a cuenta de su liquidacion. La fecha debe caer dentro del periodo abierto.",
    roles: ["admin"],
    riesgo: "crear",
    schema: {
      periodo_id: z.string().uuid(),
      socio: z.string().trim().min(2).max(160),
      monto: z.coerce.number().positive().max(100_000_000),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      metodo_pago: z.enum(METODOS_PAGO).optional(),
      notas: z.string().trim().max(300).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      exigirMontoPositivo(args.monto)
      const socio = await buscarSocio(admin, String(args.socio))
      const datos = {
        periodoId: String(args.periodo_id),
        socioId: socio.id,
        monto: Number(args.monto),
        fecha: String(args.fecha),
        metodoPago: args.metodo_pago ? String(args.metodo_pago) : "otro",
        notas: args.notas ? String(args.notas) : null,
      }
      const v = await validarAdelanto(admin, datos)
      return {
        datos,
        resumen: `Registrar adelanto de ${money(v.monto)} al socio ${socio.nombre} (${v.fecha})`,
        detalle: {
          socio: socio.nombre,
          monto: v.monto,
          fecha: v.fecha,
          periodo: v.periodo.nombre,
          metodo_pago: datos.metodoPago,
        },
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await crearAdelanto(admin, { userId: actor.userId, role: actor.role }, d)
      return { adelanto_id: r.id, monto: r.monto, fecha: r.fecha, periodo: r.periodo }
    },
  }),

  operacion({
    nombre: "devolucion_adelanto",
    titulo: "Registrar que un socio devolvio plata de un adelanto",
    descripcion:
      "El socio regresa plata de sus adelantos, completa o por partes (un abono a los adelantos). NO es un ingreso " +
      "del negocio: baja los adelantos, asi que en la liquidacion se le descuenta menos. Basta con el socio y cuanto " +
      "devolvio: el pago se reparte solo entre sus adelantos pendientes, del mas viejo al mas nuevo. adelanto_id es " +
      "opcional y solo sirve para aplicarlo a un adelanto puntual.",
    roles: ["admin"],
    riesgo: "crear",
    schema: {
      socio: z.string().trim().min(2).max(160),
      monto: z.coerce.number().positive().max(100_000_000),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      adelanto_id: z.string().uuid().optional(),
      metodo_pago: z.enum(METODOS_PAGO).optional(),
      notas: z.string().trim().max(300).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      exigirMontoPositivo(args.monto)
      const socio = await buscarSocio(admin, String(args.socio))
      const base = {
        monto: Number(args.monto),
        fecha: String(args.fecha),
        metodoPago: args.metodo_pago ? String(args.metodo_pago) : "otro",
        notas: args.notas ? String(args.notas) : null,
      }

      // Contra un adelanto puntual, solo si lo piden con su id.
      if (args.adelanto_id) {
        const datos: DatosDevolucion = { ...base, adelantoId: String(args.adelanto_id), modo: "adelanto" }
        const v = await validarDevolucionAdelanto(admin, datos)
        return {
          datos,
          resumen: `Registrar que ${socio.nombre} devolvio ${money(v.monto)} del adelanto del ${v.adelanto.fecha}`,
          detalle: {
            socio: socio.nombre,
            adelanto_del: v.adelanto.fecha,
            adelanto_entregado: v.entregado,
            ya_devuelto: v.devuelto,
            devuelve_ahora: v.monto,
            queda_del_adelanto: Math.round((v.pendiente - v.monto) * 100) / 100,
            periodo: v.periodo.nombre,
            metodo_pago: base.metodoPago,
            efecto: "Baja el adelanto: en la liquidacion se le descuenta menos. No entra como ingreso.",
          },
          avisos:
            v.monto === v.pendiente ? ["Con esta devolucion ese adelanto queda devuelto por completo."] : undefined,
        }
      }

      // Lo normal: un solo pago que se reparte entre sus adelantos.
      const datos: DatosDevolucion = { ...base, socioId: socio.id, modo: "socio" }
      const plan = await planearDevolucionSocio(admin, datos)
      return {
        datos,
        resumen: `Registrar que ${socio.nombre} devolvio ${money(plan.monto)} de sus adelantos`,
        detalle: {
          socio: socio.nombre,
          devuelve_ahora: plan.monto,
          se_reparte_en: plan.reparto.map(
            (p) => `${money(p.seAplica)} al adelanto del ${p.fechaAdelanto} (de ${money(p.adelantado)})`
          ),
          le_quedaba_por_devolver: plan.totalPendienteAntes,
          le_queda_por_devolver: plan.totalPendienteDespues,
          periodo: plan.periodo.nombre,
          metodo_pago: base.metodoPago,
          efecto: "Baja los adelantos: en la liquidacion se le descuenta menos. No entra como ingreso.",
        },
        avisos: plan.quedaTodoSaldado
          ? ["Con esto queda al dia: no le queda ningun adelanto por devolver."]
          : plan.adelantosTocados > 1
            ? [`El pago se reparte entre ${plan.adelantosTocados} adelantos, del mas viejo al mas nuevo.`]
            : undefined,
      }
    },
    ejecutar: async (admin, actor, d: DatosDevolucion) => {
      const actorErp = { userId: actor.userId, role: actor.role }
      if (d.modo === "adelanto") {
        const r = await crearDevolucionAdelanto(admin, actorErp, d)
        return {
          devolucion_id: r.id,
          adelanto_id: r.adelantoId,
          monto: r.monto,
          fecha: r.fecha,
          queda_del_adelanto: r.pendienteDespues,
          devuelto_completo: r.quedaDevueltoCompleto,
          periodo: r.periodo,
        }
      }
      const r = await crearDevolucionSocio(admin, actorErp, d)
      return {
        devoluciones: r.ids,
        monto: r.monto,
        fecha: r.fecha,
        repartida_en: r.adelantosTocados,
        le_queda_por_devolver: r.totalPendienteDespues,
        queda_al_dia: r.quedaTodoSaldado,
        periodo: r.periodo,
      }
    },
  }),

  operacion({
    nombre: "cerrar_liquidacion",
    titulo: "Cerrar la liquidacion de un periodo",
    descripcion:
      "Congela los resultados del periodo (reparto por socio y totales por metodo de pago) y lo marca como CERRADO. " +
      "Desde ese momento ninguna fecha dentro del periodo admite cambios y la aplicacion NO permite reabrirlo. " +
      "Es la operacion mas delicada del sistema.",
    roles: ["admin"],
    riesgo: "destructiva",
    schema: { periodo_id: z.string().uuid() },
    previsualizar: async (admin, _actor, args) => {
      const datos = { periodoId: String(args.periodo_id) }
      const periodo = await validarCierreLiquidacion(admin, datos.periodoId)
      return {
        datos,
        resumen: `CERRAR la liquidacion del periodo "${periodo.nombre}" (${periodo.fecha_inicio} a ${periodo.fecha_fin})`,
        detalle: {
          periodo: periodo.nombre,
          desde: periodo.fecha_inicio,
          hasta: periodo.fecha_fin,
          efecto:
            "Se congela el reparto por socio y los totales por metodo de pago; el periodo queda CERRADO.",
        },
        avisos: [
          "IRREVERSIBLE desde la aplicacion: despues de cerrar no se puede registrar ni corregir NADA con fecha " +
            "dentro de este periodo, y no hay opcion de reabrirlo. Asegurate de que todo este registrado antes.",
        ],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await cerrarLiquidacion(admin, { userId: actor.userId, role: actor.role }, String(d.periodoId))
      return { periodo_id: r.periodoId, nombre: r.nombre, desde: r.fechaInicio, hasta: r.fechaFin }
    },
  }),

  operacion({
    nombre: "configuracion_empresa",
    titulo: "Cambiar los datos de la fundacion",
    descripcion:
      "Actualiza el nombre, NIT, correo, telefono o ciudad de la fundacion (los que salen en las liquidaciones " +
      "exportadas). Manda solo lo que cambia; el nombre y el NIT no pueden quedar vacios.",
    roles: ["admin"],
    riesgo: "editar",
    schema: {
      nombre: z.string().trim().min(2).max(200).optional(),
      nit: z.string().trim().min(3).max(40).optional(),
      correo: z.union([z.literal(""), z.string().trim().email().max(160)]).optional(),
      telefono: z.string().trim().max(40).optional(),
      ciudad: z.string().trim().max(120).optional(),
    },
    previsualizar: async (admin, _actor, args) => {
      const cambios: Record<string, string> = {}
      for (const campo of ["nombre", "nit", "correo", "telefono", "ciudad"] as const) {
        const valor = args[campo]
        if (valor !== undefined) cambios[campo] = String(valor)
      }
      const previa = await previsualizarConfiguracionEmpresa(admin, cambios)
      // Son datos de la fundacion, no de una persona: se muestran completos,
      // con nombres de campo que el filtro de privacidad no confunde con PII.
      const visibles = Object.fromEntries(
        Object.entries(previa.cambios).map(([campo, c]) => [`${campo}_fundacion`, c])
      )
      return {
        datos: cambios,
        resumen: `Cambiar ${Object.keys(previa.cambios).join(", ")} de la fundacion`,
        detalle: { cambios: visibles, lo_demas: "queda igual" },
        avisos: ["Estos datos salen en las liquidaciones que se exportan y se mandan a los socios."],
      }
    },
    ejecutar: async (admin, actor, d) => {
      const r = await actualizarConfiguracionEmpresa(admin, { userId: actor.userId, role: actor.role }, d)
      return { campos_cambiados: r.camposCambiados }
    },
  }),
]
