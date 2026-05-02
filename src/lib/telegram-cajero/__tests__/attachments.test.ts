import { describe, expect, it } from "vitest"
import { createUnprocessedReceiptDraft, describeAttachment } from "../attachments"

describe("telegram cajero attachments", () => {
  it("no procesa OCR ni registra pagos", () => {
    expect(describeAttachment({ payloadType: "photo" })).toContain("no hago OCR")
    expect(createUnprocessedReceiptDraft()).toMatchObject({ status: "not_processed" })
  })
})
