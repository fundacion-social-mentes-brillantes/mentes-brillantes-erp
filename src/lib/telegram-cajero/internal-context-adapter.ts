import {
  buildAsistenteIaContext,
  buildAsistenteIaContextByCodigo,
  buildAsistenteIaContextById,
} from "@/lib/asistente-ia/context"
import { buildContabilidadContext, shouldUseContabilidadContext } from "@/lib/asistente-ia/contabilidad"

export type TelegramInternalContext = {
  kind: "persona" | "contabilidad"
  status: "ok" | "error"
  context: unknown
  userSafeErrors: string[]
}

export async function buildTelegramInternalContext(
  supabase: any,
  question: string,
  options: { asistenteId?: string | null; codigo?: string | number | null } = {}
): Promise<TelegramInternalContext> {
  try {
    if (options.asistenteId) {
      return {
        kind: "persona",
        status: "ok",
        context: await buildAsistenteIaContextById(supabase, options.asistenteId, question),
        userSafeErrors: [],
      }
    }

    if (options.codigo) {
      return {
        kind: "persona",
        status: "ok",
        context: await buildAsistenteIaContextByCodigo(supabase, String(options.codigo), question),
        userSafeErrors: [],
      }
    }

    if (shouldUseContabilidadContext(question)) {
      return {
        kind: "contabilidad",
        status: "ok",
        context: await buildContabilidadContext(supabase, question),
        userSafeErrors: [],
      }
    }

    return {
      kind: "persona",
      status: "ok",
      context: await buildAsistenteIaContext(supabase, question),
      userSafeErrors: [],
    }
  } catch (error) {
    console.error("[telegram-cajero] error construyendo contexto interno", error)
    return {
      kind: shouldUseContabilidadContext(question) ? "contabilidad" : "persona",
      status: "error",
      context: null,
      userSafeErrors: ["No pude construir el contexto estructurado del ERP para esta consulta."],
    }
  }
}
