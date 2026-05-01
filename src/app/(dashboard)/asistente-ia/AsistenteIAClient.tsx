"use client"

import { FormEvent, useState } from "react"
import { Bot, Send } from "lucide-react"

type Message = {
  role: "user" | "assistant"
  content: string
}

const initialMessage: Message = {
  role: "assistant",
  content:
    "Soy el asistente interno de solo lectura. Puedo consultar deuda, abonos, saldo a favor, donaciones y sesiones coach si me das nombre, código o cédula del asistente.",
}

export function AsistenteIAClient() {
  const [messages, setMessages] = useState<Message[]>([initialMessage])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = input.trim()
    if (!content || isLoading) return

    const nextMessages = [...messages, { role: "user" as const, content }]
    setMessages(nextMessages)
    setInput("")
    setError(null)
    setIsLoading(true)

    try {
      const response = await fetch("/api/asistente-ia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || "No se pudo consultar el asistente IA.")
      }

      setMessages((current) => [...current, { role: "assistant", content: data.answer }])
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo consultar el asistente IA.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-5xl flex-col overflow-hidden rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] shadow-sm">
      <div className="flex items-center gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[rgba(var(--accent),0.12)] text-[rgb(var(--accent-strong))]">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-[rgb(var(--text-primary))]">Asistente IA</h1>
          <p className="text-xs text-[rgb(var(--text-muted))]">Modo solo lectura para consultas internas.</p>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                message.role === "user"
                  ? "max-w-[80%] rounded-lg bg-[rgb(var(--accent))] px-4 py-3 text-sm text-white"
                  : "max-w-[80%] whitespace-pre-wrap rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-4 py-3 text-sm text-[rgb(var(--text-primary))]"
              }
            >
              {message.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="text-sm text-[rgb(var(--text-muted))]">Consultando datos internos y redactando respuesta...</div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[rgb(var(--border))] p-4">
        {error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="flex gap-3">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ej: ¿Cuánto debe María Pérez y cuántas sesiones coach le quedan?"
            className="min-h-[52px] flex-1 resize-none rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] px-3 py-2 text-sm text-[rgb(var(--text-primary))] outline-none focus:border-[rgb(var(--accent))] focus:ring-2 focus:ring-[rgba(var(--accent),0.15)]"
            rows={2}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="inline-flex h-[52px] items-center justify-center gap-2 rounded-md bg-[rgb(var(--accent))] px-4 text-sm font-semibold text-white transition-colors hover:bg-[rgb(var(--accent-strong))] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Enviar
          </button>
        </div>
      </form>
    </div>
  )
}
