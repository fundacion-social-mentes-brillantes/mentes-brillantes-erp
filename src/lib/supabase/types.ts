import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

/** Cliente de Supabase con los tipos reales de la base de datos. */
export type DbClient = SupabaseClient<Database>

export type { Database, Tables, TablesInsert, TablesUpdate, Enums } from "@/types/database"
