"use client"

import { FormEvent, useEffect, useState } from "react"
import { Bot, MessageSquare, Plus, Send, Trash2 } from "lucide-react"

type Message = {
  role: "user" | "assistant"
  content: string
}

type SelectionOption = {
  id: string
  nombre: string
  codigo: string | null
  cedula: string | null
}

type Conversation = {
  id: string
  titulo: string | null
  actualizado_en: string
}

const initialMessage: Message = {
  role: "assistant",
  content:
    "Soy el asistente interno de solo lectura. Puedo consultar deuda, abonos, saldo a favor, donaciones y sesiones coach si me das nombre, código o cédula del asistente.",
}

export function AsistenteIAClient() {
  const [messages, setMessages] = useState<Message[]>([initialMessage])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectionOptions, setSelectionOptions] = useState<SelectionOption[]>([])

  async function loadConversations(id?: string) {
    const suffix = id ? `?id=${encodeURIComponent(id)}` : ""
    const response = await fetch(`/api/asistente-ia/conversaciones${suffix}`)
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || "No se pudo cargar el historial.")

    setConversations(data.conversaciones || [])
    setActiveConversationId(data.activeConversationId || null)
    setMessages(
      Array.isArray(data.messages) && data.messages.length
        ? data.messages.map((message: any) => ({ role: message.role, content: message.content }))
        : [initialMessage]
    )
    setSelectionOptions([])
  }

  useEffect(() => {
    loadConversations().catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar el historial."))
  }, [])

  async function handleNewChat() {
    setError(null)
    setIsLoading(true)
    try {
      const response = await fetch("/api/asistente-ia/conversaciones", { method: "POST" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "No se pudo crear el chat.")
      await loadConversations(data.conversacion.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el chat.")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleDeleteChat(id: string) {
    setError(null)
    setIsLoading(true)
    try {
      const response = await fetch(`/api/asistente-ia/conversaciones?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "No se pudo borrar el chat.")
      await loadConversations()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar el chat.")
    } finally {
      setIsLoading(false)
    }
  }

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
        body: JSON.stringify({ messages: nextMessages, selectionOptions, conversationId: activeConversationId }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || "No se pudo consultar el asistente IA.")
      }

      setMessages((current) => [...current, { role: "assistant", content: data.answer }])
      if (data.conversationId) {
        setActiveConversationId(data.conversationId)
        await loadConversations(data.conversationId)
      }
      setSelectionOptions(Array.isArray(data.selectionOptions) ? data.selectionOptions : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo consultar el asistente IA.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="mx-auto grid h-[calc(100vh-8rem)] max-w-6xl grid-cols-1 overflow-hidden rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] shadow-sm md:grid-cols-[260px_1fr]">
      <aside className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--border))] px-4 py-3">
          <span className="text-sm font-semibold text-[rgb(var(--text-primary))]">Chats</span>
          <button
            type="button"
            onClick={handleNewChat}
            disabled={isLoading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--surface-2))]"
            title="Nuevo chat"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-44 space-y-1 overflow-y-auto p-2 md:max-h-none">
          {conversations.map((conversation) => (
            <div key={conversation.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => loadConversations(conversation.id).catch((err) => setError(err.message))}
                className={
                  conversation.id === activeConversationId
                    ? "flex min-w-0 flex-1 items-center gap-2 rounded-md bg-[rgba(var(--accent),0.14)] px-2 py-2 text-left text-xs font-medium text-[rgb(var(--accent-strong))]"
                    : "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-1))]"
                }
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{conversation.titulo || "Nuevo chat"}</span>
              </button>
              <button
                type="button"
                onClick={() => handleDeleteChat(conversation.id)}
                className="hidden h-7 w-7 items-center justify-center rounded-md text-[rgb(var(--text-muted))] hover:bg-red-50 hover:text-red-600 group-hover:inline-flex"
                title="Borrar conversación"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col">
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
                  ? "max-w-[80%] rounded-lg bg-[rgb(var(--accent))] px-4 py-3 text-sm text-[rgb(var(--accent-foreground))]"
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
            className="inline-flex h-[52px] items-center justify-center gap-2 rounded-md bg-[rgb(var(--accent))] px-4 text-sm font-semibold text-[rgb(var(--accent-foreground))] transition-colors hover:bg-[rgb(var(--accent-strong))] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Enviar
          </button>
        </div>
      </form>
      </section>
    </div>
  )
}
