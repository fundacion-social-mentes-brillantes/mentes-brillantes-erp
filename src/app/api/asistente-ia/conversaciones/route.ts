import { NextResponse } from "next/server"
import { AuthzError, requireRoles } from "@/lib/utils/authz"

type MensajeGuardado = { id: string; rol: string; contenido: string; creado_en: string | null }

function mapMessage(message: MensajeGuardado) {
  return {
    id: message.id,
    role: message.rol,
    content: message.contenido,
    createdAt: message.creado_en,
  }
}

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireRoles(["admin", "caja"])
    const { searchParams } = new URL(request.url)
    const requestedId = searchParams.get("id")

    const { data: conversaciones, error } = await supabase
      .from("asistente_ia_conversaciones")
      .select("id, titulo, creado_en, actualizado_en")
      .eq("usuario_id", user.id)
      .order("actualizado_en", { ascending: false })
      .limit(20)

    if (error) {
      console.error("[asistente-ia] error listando conversaciones", error)
      return NextResponse.json({ error: "No se pudo cargar el historial." }, { status: 500 })
    }

    // Un chat pedido por id solo se abre si es de quien lo pide. La base ya lo
    // impide con sus reglas por fila; esto es la segunda capa.
    let activeId: string | null = conversaciones?.[0]?.id || null
    if (requestedId) {
      const { data: propia } = await supabase
        .from("asistente_ia_conversaciones")
        .select("id")
        .eq("id", requestedId)
        .eq("usuario_id", user.id)
        .maybeSingle()
      activeId = propia?.id ?? null
    }
    let messages: MensajeGuardado[] = []

    if (activeId) {
      const { data: mensajes, error: mensajesError } = await supabase
        .from("asistente_ia_mensajes")
        .select("id, rol, contenido, creado_en")
        .eq("conversacion_id", activeId)
        .order("creado_en", { ascending: true })

      if (mensajesError) {
        console.error("[asistente-ia] error cargando mensajes", mensajesError)
        return NextResponse.json({ error: "No se pudo cargar la conversacion." }, { status: 500 })
      }

      messages = mensajes || []
    }

    return NextResponse.json({
      conversaciones: conversaciones || [],
      activeConversationId: activeId,
      messages: messages.map(mapMessage),
    })
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error("[asistente-ia]", error)
    return NextResponse.json({ error: "Error interno del historial." }, { status: 500 })
  }
}

export async function POST() {
  try {
    const { supabase, user } = await requireRoles(["admin", "caja"])
    const { data, error } = await supabase
      .from("asistente_ia_conversaciones")
      .insert({ usuario_id: user.id, titulo: "Nuevo chat" })
      .select("id, titulo, creado_en, actualizado_en")
      .single()

    if (error) {
      console.error("[asistente-ia] error creando conversacion", error)
      return NextResponse.json({ error: "No se pudo crear el chat." }, { status: 500 })
    }

    return NextResponse.json({ conversacion: data, messages: [] })
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error("[asistente-ia]", error)
    return NextResponse.json({ error: "Error interno del historial." }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, user } = await requireRoles(["admin", "caja"])
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) return NextResponse.json({ error: "Falta la conversacion." }, { status: 400 })

    const { error } = await supabase
      .from("asistente_ia_conversaciones")
      .delete()
      .eq("id", id)
      .eq("usuario_id", user.id)

    if (error) {
      console.error("[asistente-ia] error borrando conversacion", error)
      return NextResponse.json({ error: "No se pudo borrar el chat." }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error("[asistente-ia]", error)
    return NextResponse.json({ error: "Error interno del historial." }, { status: 500 })
  }
}
