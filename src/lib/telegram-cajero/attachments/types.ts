export type AttachmentContext = {
  payloadType: "photo" | "document" | "unknown"
  fileId?: string
  fileName?: string
  mimeType?: string
  caption?: string
}

export type ExtractedReceiptDraft = {
  provider: "not_configured"
  status: "not_processed"
  amount?: number
  method?: string
  date?: string
  rawText?: string
}
