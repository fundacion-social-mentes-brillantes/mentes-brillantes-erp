export const TOOL_LIMIT = 5

export const TELEGRAM_CAJERO_TOOL_CATALOG = [
  {
    name: "searchPerson",
    description: "Busca asistentes por nombre, codigo o cedula.",
    allowedArgs: ["term", "limit"],
    returns: "Coincidencias de asistentes.",
    safety: "read_only",
  },
  {
    name: "getPersonFinancialStatus",
    description: "Consulta facturado, abonado, pendiente y saldo a favor de una persona.",
    allowedArgs: ["asistenteId", "personQuery"],
    returns: "Totales financieros y cuentas de la persona.",
    safety: "read_only",
  },
  {
    name: "getPersonPayments",
    description: "Consulta pagos/abonos validos recientes de una persona.",
    allowedArgs: ["asistenteId", "personQuery", "limit"],
    returns: "Lista de pagos recientes.",
    safety: "read_only",
  },
  {
    name: "getPersonLastPayment",
    description: "Consulta el ultimo pago valido de una persona.",
    allowedArgs: ["asistenteId", "personQuery"],
    returns: "Ultimo pago valido encontrado.",
    safety: "read_only",
  },
  {
    name: "getPersonPurchasesOrConcepts",
    description: "Consulta cuentas, conceptos comprados, abonado y pendiente de una persona.",
    allowedArgs: ["asistenteId", "personQuery", "limit"],
    returns: "Conceptos/cuentas de la persona.",
    safety: "read_only",
  },
  {
    name: "getPersonFullProfile",
    description: "Consulta ficha financiera compacta de una persona.",
    allowedArgs: ["asistenteId", "personQuery"],
    returns: "Estado financiero, compras, pagos y coach.",
    safety: "read_only",
  },
  {
    name: "getOpenReceivablesSummary",
    description: "Consulta cartera pendiente global.",
    allowedArgs: ["limit"],
    returns: "Total cartera, personas con deuda y mayores pendientes.",
    safety: "read_only",
  },
  {
    name: "getSummary",
    description: "Consulta resumen financiero por rango de fechas.",
    allowedArgs: ["fechaInicio", "fechaFin", "range"],
    returns: "Ingresos, egresos, utilidad estimada y metodos.",
    safety: "read_only",
  },
  {
    name: "getBusinessAlerts",
    description: "Consulta alertas prudentes de negocio por rango.",
    allowedArgs: ["fechaInicio", "fechaFin", "range"],
    returns: "Alertas con evidencia.",
    safety: "read_only",
  },
  {
    name: "searchGlobal",
    description: "Busca en modulos importantes del ERP.",
    allowedArgs: ["term"],
    returns: "Resultados agrupados por modulo.",
    safety: "read_only",
  },
  {
    name: "getConceptBuyers",
    description:
      "Lista TODAS las personas que compraron/iniciaron/tienen un concepto o producto (p. ej. 'pasos', 'primer paso', 'curso de milagros', 'sesion coach'). Busca en el texto de las cuentas por cobrar sin importar mayusculas ni variantes (paso/pasos). Usar cuando piden un LISTADO de personas por un concepto, no los datos de una sola persona.",
    allowedArgs: ["term", "concepto", "limit"],
    returns: "Total de personas y lista (nombre, codigo, veces) que tienen ese concepto.",
    safety: "read_only",
  },
  {
    name: "getCoachSessions",
    description: "Consulta sesiones coach compradas, realizadas y restantes de una persona.",
    allowedArgs: ["asistenteId", "personQuery"],
    returns: "Contador y ultimas sesiones coach.",
    safety: "read_only",
  },
  {
    name: "getExpenses",
    description: "Consulta egresos activos por rango.",
    allowedArgs: ["fechaInicio", "fechaFin", "range"],
    returns: "Total y lista de egresos.",
    safety: "read_only",
  },
  {
    name: "getExternalSales",
    description: "Consulta ventas externas activas por rango.",
    allowedArgs: ["fechaInicio", "fechaFin", "range"],
    returns: "Total y lista de ventas externas.",
    safety: "read_only",
  },
  {
    name: "getPersonDonations",
    description: "Consulta las donaciones registradas por una persona (total y detalle).",
    allowedArgs: ["asistenteId", "personQuery"],
    returns: "Total donado y lista de donaciones de la persona.",
    safety: "read_only",
  },
  {
    name: "getDonationsSummary",
    description: "Consulta el total de donaciones del centro por rango de fechas.",
    allowedArgs: ["fechaInicio", "fechaFin", "range"],
    returns: "Total y detalle de donaciones del periodo.",
    safety: "read_only",
  },
  {
    name: "getCounts",
    description: "Consulta conteos: asistentes activos, asistentes totales y cuentas por cobrar pendientes.",
    allowedArgs: [],
    returns: "Numeros de asistentes activos/total y cuentas pendientes.",
    safety: "read_only",
  },
  {
    name: "getPeriods",
    description: "Consulta los periodos contables y cual esta abierto o cerrado.",
    allowedArgs: ["estado"],
    returns: "Lista de periodos con su estado y fechas.",
    safety: "read_only",
  },
  {
    name: "getPartnerSettlement",
    description: "Consulta los socios, su porcentaje y su liquidacion/reparto mas reciente (cuanto le toca).",
    allowedArgs: ["socioQuery"],
    returns: "Socios con porcentaje y ultima liquidacion (valor neto a pagar, adelantos).",
    safety: "read_only",
  },
] as const

export type AllowedToolName = (typeof TELEGRAM_CAJERO_TOOL_CATALOG)[number]["name"]

const TOOL_NAMES = new Set<string>(TELEGRAM_CAJERO_TOOL_CATALOG.map((tool) => tool.name))

export function isAllowedToolName(value: unknown): value is AllowedToolName {
  return typeof value === "string" && TOOL_NAMES.has(value)
}

export function getToolCatalogForPrompt() {
  return TELEGRAM_CAJERO_TOOL_CATALOG.map((tool) => ({
    name: tool.name,
    description: tool.description,
    allowedArgs: tool.allowedArgs,
    safety: tool.safety,
  }))
}
