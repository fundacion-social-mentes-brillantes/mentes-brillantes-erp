import { NextRequest, NextResponse } from "next/server"
import Papa from "papaparse"
import JSZip from "jszip"
import { requireAdmin } from "@/lib/utils/authz"
import { readFile } from "fs/promises"
import path from "path"

const TABLES = [
  "configuracion_empresa",
  "asistentes",
  "cuentas_por_cobrar",
  "pagos_abonos",
  "egresos",
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
]

const isTableAllowed = (table: string) => TABLES.includes(table)

async function tableExists(supabase: any, table: string) {
  const { data, error } = await supabase
    .from("information_schema.tables")
    .select("table_name")
    .eq("table_schema", "public")
    .eq("table_name", table)
    .maybeSingle()

  if (error) {
    console.warn(`No se pudo verificar la tabla ${table}: ${error.message}`)
    return false
  }

  return Boolean(data?.table_name)
}

async function fetchCsv(supabase: any, table: string) {
  const { data, error } = await supabase.from(table).select("*")
  if (error) throw new Error(`Error al consultar ${table}: ${error.message}`)
  const csv = Papa.unparse(data ?? [])
  return "\uFEFF" + csv
}

export async function GET(_req: NextRequest, context: { params: Promise<{ resource: string }> }) {
  const { resource } = await context.params
  const { supabase } = await requireAdmin()
  if (!supabase) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const today = new Date().toISOString().slice(0, 10)

  try {
    if (resource === "full") {
      const zip = new JSZip()

      const warnings: string[] = []

      for (const table of TABLES) {
        const exists = await tableExists(supabase, table)
        if (!exists) {
          warnings.push(`- Tabla omitida: ${table} (no existe en este entorno)`)
          continue
        }

        try {
          const csv = await fetchCsv(supabase, table)
          zip.file(`${table}_${today}.csv`, csv)
        } catch (err: any) {
          warnings.push(`- Tabla omitida: ${table} (error al consultar: ${err?.message || "desconocido"})`)
        }
      }

      const schemaPath = path.join(process.cwd(), "supabase", "schema.sql")
      const schema = await readFile(schemaPath, "utf-8")
      zip.file(`schema_${today}.sql`, schema)

      const readme = [
        `Backup completo - ${today}`,
        "",
        "Contenido:",
        ...TABLES.map((t) => `- ${t}_${today}.csv`),
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
          : ["", "Advertencias:", "- Ninguna (todas las tablas configuradas existen en este entorno)"]),
        "",
        "Codificación: UTF-8 con BOM para CSV.",
      ].join("\n")
      zip.file(`README_${today}.txt`, readme)

      const buffer = await zip.generateAsync({ type: "nodebuffer" })
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="backup_completo_${today}.zip"`,
        },
      })
    }

    if (!isTableAllowed(resource)) {
      return NextResponse.json({ error: "Tabla no permitida" }, { status: 400 })
    }

    const exists = await tableExists(supabase, resource)
    if (!exists) {
      return NextResponse.json({ error: "Tabla no existe en este entorno" }, { status: 404 })
    }

    const csv = await fetchCsv(supabase, resource)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${resource}_${today}.csv"`,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Error al generar respaldo" }, { status: 500 })
  }
}
