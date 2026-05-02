import type { AttachmentContext, ExtractedReceiptDraft } from "./types"

export function describeAttachment(context: AttachmentContext) {
  if (context.payloadType === "photo") {
    return "Veo una foto/comprobante. En esta fase no hago OCR ni registro pagos automaticamente; debe revisarlo una persona."
  }
  if (context.payloadType === "document") {
    return "Veo un documento. En esta fase no proceso archivos ni registro pagos automaticamente; queda para revision humana."
  }
  return "Veo un adjunto, pero el OCR aun no esta activo."
}

export function createUnprocessedReceiptDraft(): ExtractedReceiptDraft {
  return { provider: "not_configured", status: "not_processed" }
}

export type { AttachmentContext, ExtractedReceiptDraft } from "./types"
