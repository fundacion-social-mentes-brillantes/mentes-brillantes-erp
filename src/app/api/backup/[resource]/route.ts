import { NextRequest, NextResponse } from "next/server"
import Papa from "papaparse"
import JSZip from "jszip"
import { readFile } from "fs/promises"
import path from "path"
import { AuthzError, requireAdmin } from "@/lib/utils/authz"
import { leerTodas } from "@/lib/supabase/paginar"
import { mensajeDeError } from "@/lib/utils/errores"
import type { DbClient } from "@/lib/supabase/types"
import { fechaHoyBogota } from "@/lib/utils/fechas"

// Respaldo en CSV (solo admin). Cada tabla se lee POR PAGINAS: la API de
// Supabase corta en 1000 filas, y antes el "respaldo completo" traia 1000 de
// 2286 cuentas y 1000 de 1929 pagos sin avisar. Ahora ademas se compara lo
// leido con el conteo real de la tabla y cualquier diferencia queda escrita.

const TABLES = [
  "configuracion_empresa",
  "asistentes",
  "cuentas_por_cobrar",
  "pagos_abonos",
  "egresos",
  "ventas_externas",
  "socios",
  "periodos",
  "adelantos_socios",
  "donaciones_asistentes",
  "coach_paquetes",
  "coach_sesiones",
  "movimientos_saldo_favor",
  "perfiles",
  "liquidaciones_socios",
  "liquidaciones_resumen_cuentas",
] as const

type TablaRespaldo = (typeof TABLES)[number]

const isTableAllowed = (table: string): table is TablaRespaldo => (TABLES as readonly string[]).includes(table)

async function leerTabla(supabase: DbClient, table: TablaRespaldo) {
  const filas = await leerTodas((desde, hasta) =>
    supabase.from(table).select("*").order("id", { ascending: true }).range(desde, hasta)
  )
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true })
  if (error) throw new Error(`No se pudo contar ${table}: ${error.message}`)
  return { filas, total: count ?? filas.length }
}

const aCsv = (filas: unknown[]) => "﻿" + Papa.unparse(filas as object[])

export async function GET(_req: NextRequest, context: { params: Promise<{ resource: string }> }) {
  const { resource } = await context.params

  let supabase: DbClient
  try {
    ;({ supabase } = await requireAdmin())
  } catch (error) {
    const status = error instanceof AuthzError ? 403 : 500
    return NextResponse.json({ error: "No autorizado" }, { status })
  }

  const today = fechaHoyBogota()

  try {
    if (resource === "full") {
      const zip = new JSZip()
      const warnings: string[] = []
      const resumen: string[] = []

      for (const table of TABLES) {
        try {
          const { filas, total } = await leerTabla(supabase, table)
          zip.file(`${table}_${today}.csv`, aCsv(filas))
          resumen.push(`- ${table}: ${filas.length} filas`)
          if (filas.length !== total) {
            warnings.push(`- ${table}: se leyeron ${filas.length} filas pero la tabla tiene ${total}. Revisar.`)
          }
        } catch (err) {
          warnings.push(`- Tabla omitida: ${table} (error al consultar: ${mensajeDeError(err, "desconocido")})`)
        }
      }

      try {
        const schema = await readFile(path.join(process.cwd(), "supabase", "schema.sql"), "utf-8")
        zip.file(`schema_${today}.sql`, schema)
      } catch {
        warnings.push("- No se incluyo schema.sql (el archivo no esta disponible en el servidor).")
      }

      const readme = [
        `Backup completo - ${today}`,
        "",
        "Contenido:",
        ...resumen,
        `- schema_${today}.sql`,
        "",
        "Orden sugerido de restauración:",
        "- configuracion_empresa",
        "- asistentes",
        "- socios",
        "- periodos",
        "- cuentas_por_cobrar",
        "- pagos_abonos",
        "- egresos",
        "- ventas_externas",
        "- donaciones_asistentes",
        "- movimientos_saldo_favor",
        "- coach_paquetes / coach_sesiones",
        "- snapshots de liquidación (liquidaciones_resumen_cuentas, liquidaciones_socios)",
        "",
        "Notas:",
        "- La tabla perfiles NO reemplaza auth.users; este backup no restaura usuarios/contraseñas de Supabase Auth.",
        "- Este respaldo cubre datos del sistema y schema.sql, no credenciales de Auth.",
        ...(warnings.length
          ? ["", "Advertencias:", ...warnings]
          : ["", "Advertencias:", "- Ninguna: cada tabla trae todas sus filas."]),
        "",
        "Codificación: UTF-8 con BOM para CSV.",
      ].join("\n")
      zip.file(`README_${today}.txt`, readme)

      const buffer = await zip.generateAsync({ type: "nodebuffer" })
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="backup_completo_${today}.zip"`,
          "Cache-Control": "no-store",
        },
      })
    }

    if (!isTableAllowed(resource)) {
      return NextResponse.json({ error: "Tabla no permitida" }, { status: 400 })
    }

    const { filas } = await leerTabla(supabase, resource)
    return new NextResponse(aCsv(filas), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${resource}_${today}.csv"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("[backup]", error)
    return NextResponse.json({ error: mensajeDeError(error, "Error al generar respaldo") }, { status: 500 })
  }
}
