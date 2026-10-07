// Tipos de la base de datos de Supabase (proyecto ingresos-egresos-pro).
// Archivo GENERADO: no editarlo a mano. Para regenerarlo despues de una migracion:
//   npx supabase gen types typescript --project-id hjochgwzfegtzyfagawq --schema public > src/types/database.ts
// (o con la herramienta generate_typescript_types del conector de Supabase).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      adelantos_socios: {
        Row: {
          adelanto_id: string | null
          creado_en: string | null
          fecha: string
          id: string
          legacy_row_id: string | null
          metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          notas: string | null
          periodo_id: string | null
          socio_id: string | null
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          adelanto_id?: string | null
          creado_en?: string | null
          fecha?: string
          id?: string
          legacy_row_id?: string | null
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          notas?: string | null
          periodo_id?: string | null
          socio_id?: string | null
          tipo?: string
          usuario_id?: string | null
        }
        Update: {
          adelanto_id?: string | null
          creado_en?: string | null
          fecha?: string
          id?: string
          legacy_row_id?: string | null
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          notas?: string | null
          periodo_id?: string | null
          socio_id?: string | null
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "adelantos_socios_adelanto_id_fkey"
            columns: ["adelanto_id"]
            isOneToOne: false
            referencedRelation: "adelantos_socios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adelantos_socios_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adelantos_socios_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "socios"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_diferencias_resueltas: {
        Row: {
          creado_en: string
          decision: string
          evento_id: string
          id: string
          nota: string | null
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          creado_en?: string
          decision: string
          evento_id: string
          id?: string
          nota?: string | null
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          creado_en?: string
          decision?: string
          evento_id?: string
          id?: string
          nota?: string | null
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      agenda_eventos: {
        Row: {
          codigo_persona: number | null
          creado_en: string
          eliminado: boolean
          fecha: string
          hecho: boolean
          id: string
          inicio: string | null
          modalidad: string | null
          nombre_persona: string | null
          titulo: string | null
          visto_en: string
          workspace_id: string
        }
        Insert: {
          codigo_persona?: number | null
          creado_en?: string
          eliminado?: boolean
          fecha: string
          hecho?: boolean
          id: string
          inicio?: string | null
          modalidad?: string | null
          nombre_persona?: string | null
          titulo?: string | null
          visto_en?: string
          workspace_id: string
        }
        Update: {
          codigo_persona?: number | null
          creado_en?: string
          eliminado?: boolean
          fecha?: string
          hecho?: boolean
          id?: string
          inicio?: string | null
          modalidad?: string | null
          nombre_persona?: string | null
          titulo?: string | null
          visto_en?: string
          workspace_id?: string
        }
        Relationships: []
      }
      asistente_ia_conversaciones: {
        Row: {
          actualizado_en: string
          creado_en: string
          id: string
          titulo: string | null
          usuario_id: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          id?: string
          titulo?: string | null
          usuario_id: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          id?: string
          titulo?: string | null
          usuario_id?: string
        }
        Relationships: []
      }
      asistente_ia_mensajes: {
        Row: {
          contenido: string
          conversacion_id: string
          creado_en: string
          id: string
          rol: string
        }
        Insert: {
          contenido: string
          conversacion_id: string
          creado_en?: string
          id?: string
          rol: string
        }
        Update: {
          contenido?: string
          conversacion_id?: string
          creado_en?: string
          id?: string
          rol?: string
        }
        Relationships: [
          {
            foreignKeyName: "asistente_ia_mensajes_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "asistente_ia_conversaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      asistentes: {
        Row: {
          activo: boolean | null
          cedula: string | null
          codigo: string | null
          correo: string | null
          creado_en: string | null
          fecha_inicio_proceso: string | null
          fecha_registro: string | null
          id: string
          legacy_asistente_id: string | null
          legacy_row_id: string | null
          nombre: string
          telefono: string | null
        }
        Insert: {
          activo?: boolean | null
          cedula?: string | null
          codigo?: string | null
          correo?: string | null
          creado_en?: string | null
          fecha_inicio_proceso?: string | null
          fecha_registro?: string | null
          id?: string
          legacy_asistente_id?: string | null
          legacy_row_id?: string | null
          nombre: string
          telefono?: string | null
        }
        Update: {
          activo?: boolean | null
          cedula?: string | null
          codigo?: string | null
          correo?: string | null
          creado_en?: string | null
          fecha_inicio_proceso?: string | null
          fecha_registro?: string | null
          id?: string
          legacy_asistente_id?: string | null
          legacy_row_id?: string | null
          nombre?: string
          telefono?: string | null
        }
        Relationships: []
      }
      auditoria_financiera: {
        Row: {
          accion: string
          fecha: string | null
          id: string
          motivo: string
          registro_id: string
          tabla_afectada: string
          usuario_id: string
          valor_anterior: number | null
          valor_nuevo: number | null
        }
        Insert: {
          accion: string
          fecha?: string | null
          id?: string
          motivo: string
          registro_id: string
          tabla_afectada: string
          usuario_id: string
          valor_anterior?: number | null
          valor_nuevo?: number | null
        }
        Update: {
          accion?: string
          fecha?: string | null
          id?: string
          motivo?: string
          registro_id?: string
          tabla_afectada?: string
          usuario_id?: string
          valor_anterior?: number | null
          valor_nuevo?: number | null
        }
        Relationships: []
      }
      coach_paquetes: {
        Row: {
          asistente_id: string
          creado_en: string
          cuenta_id: string
          id: string
          notas: string | null
          sesiones_compradas: number
        }
        Insert: {
          asistente_id: string
          creado_en?: string
          cuenta_id: string
          id?: string
          notas?: string | null
          sesiones_compradas: number
        }
        Update: {
          asistente_id?: string
          creado_en?: string
          cuenta_id?: string
          id?: string
          notas?: string | null
          sesiones_compradas?: number
        }
        Relationships: [
          {
            foreignKeyName: "coach_paquetes_asistente_id_fkey"
            columns: ["asistente_id"]
            isOneToOne: false
            referencedRelation: "asistentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_paquetes_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: true
            referencedRelation: "cuentas_por_cobrar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_paquetes_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: true
            referencedRelation: "vista_cuentas_saldos"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_sesiones: {
        Row: {
          asistente_id: string
          creado_en: string
          evento_agenda_id: string | null
          fecha: string
          id: string
          notas: string | null
          paquete_id: string
        }
        Insert: {
          asistente_id: string
          creado_en?: string
          evento_agenda_id?: string | null
          fecha?: string
          id?: string
          notas?: string | null
          paquete_id: string
        }
        Update: {
          asistente_id?: string
          creado_en?: string
          evento_agenda_id?: string | null
          fecha?: string
          id?: string
          notas?: string | null
          paquete_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_sesiones_asistente_id_fkey"
            columns: ["asistente_id"]
            isOneToOne: false
            referencedRelation: "asistentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_sesiones_paquete_id_fkey"
            columns: ["paquete_id"]
            isOneToOne: false
            referencedRelation: "coach_paquetes"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_empresa: {
        Row: {
          ciudad: string | null
          correo: string | null
          id: number
          nit: string
          nombre: string
          telefono: string | null
          updated_at: string
        }
        Insert: {
          ciudad?: string | null
          correo?: string | null
          id?: number
          nit: string
          nombre: string
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          ciudad?: string | null
          correo?: string | null
          id?: number
          nit?: string
          nombre?: string
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cuentas_por_cobrar: {
        Row: {
          asistente_id: string | null
          concepto: string
          creado_en: string | null
          estado: Database["public"]["Enums"]["estado_cuenta"]
          fecha_emision: string
          id: string
          legacy_row_id: string | null
          valor_total: number
        }
        Insert: {
          asistente_id?: string | null
          concepto: string
          creado_en?: string | null
          estado?: Database["public"]["Enums"]["estado_cuenta"]
          fecha_emision: string
          id?: string
          legacy_row_id?: string | null
          valor_total: number
        }
        Update: {
          asistente_id?: string | null
          concepto?: string
          creado_en?: string | null
          estado?: Database["public"]["Enums"]["estado_cuenta"]
          fecha_emision?: string
          id?: string
          legacy_row_id?: string | null
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_por_cobrar_asistente_id_fkey"
            columns: ["asistente_id"]
            isOneToOne: false
            referencedRelation: "asistentes"
            referencedColumns: ["id"]
          },
        ]
      }
      donaciones_asistentes: {
        Row: {
          asistente_id: string
          creado_en: string
          estado: string
          fecha: string
          id: string
          legacy_row_id: string | null
          metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          notas: string | null
          usuario_id: string | null
        }
        Insert: {
          asistente_id: string
          creado_en?: string
          estado?: string
          fecha?: string
          id?: string
          legacy_row_id?: string | null
          metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          notas?: string | null
          usuario_id?: string | null
        }
        Update: {
          asistente_id?: string
          creado_en?: string
          estado?: string
          fecha?: string
          id?: string
          legacy_row_id?: string | null
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          notas?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "donaciones_asistentes_asistente_id_fkey"
            columns: ["asistente_id"]
            isOneToOne: false
            referencedRelation: "asistentes"
            referencedColumns: ["id"]
          },
        ]
      }
      egresos: {
        Row: {
          categoria: string
          concepto: string
          creado_en: string | null
          estado: string | null
          fecha: string
          id: string
          legacy_row_id: string | null
          metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          notas: string | null
          usuario_id: string | null
        }
        Insert: {
          categoria: string
          concepto: string
          creado_en?: string | null
          estado?: string | null
          fecha?: string
          id?: string
          legacy_row_id?: string | null
          metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          notas?: string | null
          usuario_id?: string | null
        }
        Update: {
          categoria?: string
          concepto?: string
          creado_en?: string | null
          estado?: string | null
          fecha?: string
          id?: string
          legacy_row_id?: string | null
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          notas?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      liquidaciones_resumen_cuentas: {
        Row: {
          created_at: string
          id: string
          ingresos_abonos: number
          ingresos_donaciones: number
          ingresos_ventas_externas: number
          metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          periodo_id: string
          saldo_neto_periodo: number
          salidas_adelantos: number
          salidas_egresos: number
          total_ingresos: number
          total_salidas: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingresos_abonos?: number
          ingresos_donaciones?: number
          ingresos_ventas_externas?: number
          metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          periodo_id: string
          saldo_neto_periodo?: number
          salidas_adelantos?: number
          salidas_egresos?: number
          total_ingresos?: number
          total_salidas?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          ingresos_abonos?: number
          ingresos_donaciones?: number
          ingresos_ventas_externas?: number
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"]
          periodo_id?: string
          saldo_neto_periodo?: number
          salidas_adelantos?: number
          salidas_egresos?: number
          total_ingresos?: number
          total_salidas?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "liquidaciones_resumen_cuentas_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
        ]
      }
      liquidaciones_socios: {
        Row: {
          adelantos_descontados: number
          donaciones_periodo: number
          egresos_periodo: number
          generado_en: string | null
          id: string
          ingresos_cobrados: number
          ingresos_operativos: number
          periodo_id: string | null
          porcentaje_aplicado: number
          socio_id: string | null
          utilidad_neta: number
          valor_correspondiente: number
          valor_neto_pagar: number
        }
        Insert: {
          adelantos_descontados: number
          donaciones_periodo?: number
          egresos_periodo: number
          generado_en?: string | null
          id?: string
          ingresos_cobrados: number
          ingresos_operativos?: number
          periodo_id?: string | null
          porcentaje_aplicado: number
          socio_id?: string | null
          utilidad_neta: number
          valor_correspondiente: number
          valor_neto_pagar: number
        }
        Update: {
          adelantos_descontados?: number
          donaciones_periodo?: number
          egresos_periodo?: number
          generado_en?: string | null
          id?: string
          ingresos_cobrados?: number
          ingresos_operativos?: number
          periodo_id?: string | null
          porcentaje_aplicado?: number
          socio_id?: string | null
          utilidad_neta?: number
          valor_correspondiente?: number
          valor_neto_pagar?: number
        }
        Relationships: [
          {
            foreignKeyName: "liquidaciones_socios_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_socios_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "socios"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_access_audit: {
        Row: {
          args_hash: string
          client_id_hash: string
          client_kind: string
          client_name: string
          created_at: string
          duration_ms: number
          id: number
          result_count: number | null
          status: string
          tool_name: string
          user_id: string | null
        }
        Insert: {
          args_hash: string
          client_id_hash: string
          client_kind: string
          client_name: string
          created_at?: string
          duration_ms: number
          id?: never
          result_count?: number | null
          status: string
          tool_name: string
          user_id?: string | null
        }
        Update: {
          args_hash?: string
          client_id_hash?: string
          client_kind?: string
          client_name?: string
          created_at?: string
          duration_ms?: number
          id?: never
          result_count?: number | null
          status?: string
          tool_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      mcp_oauth_artifacts: {
        Row: {
          client_id_hash: string
          client_name: string | null
          consumed_at: string | null
          created_at: string
          email: string | null
          expires_at: string
          family_id: string | null
          id: string
          resource: string
          revoked_at: string | null
          role: string | null
          scope: string
          token_hash: string
          token_type: string
          user_id: string
        }
        Insert: {
          client_id_hash: string
          client_name?: string | null
          consumed_at?: string | null
          created_at?: string
          email?: string | null
          expires_at: string
          family_id?: string | null
          id?: string
          resource: string
          revoked_at?: string | null
          role?: string | null
          scope?: string
          token_hash: string
          token_type: string
          user_id: string
        }
        Update: {
          client_id_hash?: string
          client_name?: string | null
          consumed_at?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          family_id?: string | null
          id?: string
          resource?: string
          revoked_at?: string | null
          role?: string | null
          scope?: string
          token_hash?: string
          token_type?: string
          user_id?: string
        }
        Relationships: []
      }
      mcp_operaciones: {
        Row: {
          creado_en: string
          ejecutado_en: string | null
          error: string | null
          estado: string
          expira_en: string
          huella: string
          id: string
          operacion: string
          params: Json
          resultado: Json | null
          resumen: string
          user_id: string
        }
        Insert: {
          creado_en?: string
          ejecutado_en?: string | null
          error?: string | null
          estado?: string
          expira_en: string
          huella: string
          id: string
          operacion: string
          params: Json
          resultado?: Json | null
          resumen: string
          user_id: string
        }
        Update: {
          creado_en?: string
          ejecutado_en?: string | null
          error?: string | null
          estado?: string
          expira_en?: string
          huella?: string
          id?: string
          operacion?: string
          params?: Json
          resultado?: Json | null
          resumen?: string
          user_id?: string
        }
        Relationships: []
      }
      movimientos_saldo_favor: {
        Row: {
          asistente_id: string
          creado_en: string
          cuenta_id: string | null
          estado: string | null
          fecha: string
          id: string
          metodo_pago: string | null
          monto: number
          notas: string | null
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          asistente_id: string
          creado_en?: string
          cuenta_id?: string | null
          estado?: string | null
          fecha: string
          id?: string
          metodo_pago?: string | null
          monto: number
          notas?: string | null
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          asistente_id?: string
          creado_en?: string
          cuenta_id?: string | null
          estado?: string | null
          fecha?: string
          id?: string
          metodo_pago?: string | null
          monto?: number
          notas?: string | null
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_saldo_favor_asistente_id_fkey"
            columns: ["asistente_id"]
            isOneToOne: false
            referencedRelation: "asistentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_saldo_favor_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_por_cobrar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_saldo_favor_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "vista_cuentas_saldos"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_abonos: {
        Row: {
          creado_en: string | null
          cuenta_id: string | null
          estado: string | null
          fecha_pago: string
          id: string
          legacy_row_id: string | null
          metodo_pago: Database["public"]["Enums"]["metodo_pago"] | null
          monto: number
          notas: string | null
          origen_fondos: string | null
          usuario_id: string | null
        }
        Insert: {
          creado_en?: string | null
          cuenta_id?: string | null
          estado?: string | null
          fecha_pago: string
          id?: string
          legacy_row_id?: string | null
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"] | null
          monto: number
          notas?: string | null
          origen_fondos?: string | null
          usuario_id?: string | null
        }
        Update: {
          creado_en?: string | null
          cuenta_id?: string | null
          estado?: string | null
          fecha_pago?: string
          id?: string
          legacy_row_id?: string | null
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"] | null
          monto?: number
          notas?: string | null
          origen_fondos?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_abonos_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_por_cobrar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_abonos_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "vista_cuentas_saldos"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          asistente_id: string | null
          creado_en: string | null
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
        }
        Insert: {
          asistente_id?: string | null
          creado_en?: string | null
          id: string
          nombre: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
        }
        Update: {
          asistente_id?: string | null
          creado_en?: string | null
          id?: string
          nombre?: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
        }
        Relationships: [
          {
            foreignKeyName: "perfiles_asistente_id_fkey"
            columns: ["asistente_id"]
            isOneToOne: true
            referencedRelation: "asistentes"
            referencedColumns: ["id"]
          },
        ]
      }
      periodos: {
        Row: {
          creado_en: string | null
          estado: Database["public"]["Enums"]["estado_periodo"]
          fecha_fin: string
          fecha_inicio: string
          id: string
          legacy_row_id: string | null
          nombre: string
        }
        Insert: {
          creado_en?: string | null
          estado?: Database["public"]["Enums"]["estado_periodo"]
          fecha_fin: string
          fecha_inicio: string
          id?: string
          legacy_row_id?: string | null
          nombre: string
        }
        Update: {
          creado_en?: string | null
          estado?: Database["public"]["Enums"]["estado_periodo"]
          fecha_fin?: string
          fecha_inicio?: string
          id?: string
          legacy_row_id?: string | null
          nombre?: string
        }
        Relationships: []
      }
      socios: {
        Row: {
          activo: boolean | null
          creado_en: string | null
          id: string
          legacy_row_id: string | null
          nombre: string
          porcentaje_participacion: number
          usuario_id: string | null
        }
        Insert: {
          activo?: boolean | null
          creado_en?: string | null
          id?: string
          legacy_row_id?: string | null
          nombre: string
          porcentaje_participacion: number
          usuario_id?: string | null
        }
        Update: {
          activo?: boolean | null
          creado_en?: string | null
          id?: string
          legacy_row_id?: string | null
          nombre?: string
          porcentaje_participacion?: number
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "socios_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_bot_sessions: {
        Row: {
          channel: string
          chat_id: string
          created_at: string
          expires_at: string
          id: string
          pending_action: Json | null
          pending_selection: Json | null
          state: Json
          tenant_id: string
          thread_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: string
          chat_id: string
          created_at?: string
          expires_at: string
          id: string
          pending_action?: Json | null
          pending_selection?: Json | null
          state?: Json
          tenant_id?: string
          thread_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          chat_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          pending_action?: Json | null
          pending_selection?: Json | null
          state?: Json
          tenant_id?: string
          thread_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ventas_externas: {
        Row: {
          comprador_nombre: string | null
          concepto: string
          creado_en: string
          estado: string
          fecha: string
          id: string
          legacy_row_id: string | null
          metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          notas: string | null
          usuario_id: string | null
        }
        Insert: {
          comprador_nombre?: string | null
          concepto: string
          creado_en?: string
          estado?: string
          fecha?: string
          id?: string
          legacy_row_id?: string | null
          metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          notas?: string | null
          usuario_id?: string | null
        }
        Update: {
          comprador_nombre?: string | null
          concepto?: string
          creado_en?: string
          estado?: string
          fecha?: string
          id?: string
          legacy_row_id?: string | null
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          notas?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      vista_cuentas_saldos: {
        Row: {
          asistente_id: string | null
          estado: Database["public"]["Enums"]["estado_cuenta"] | null
          id: string | null
          monto_pendiente: number | null
          total_abonado: number | null
          valor_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_por_cobrar_asistente_id_fkey"
            columns: ["asistente_id"]
            isOneToOne: false
            referencedRelation: "asistentes"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_movimientos_generales: {
        Row: {
          asistente_id: string | null
          asistente_nombre: string | null
          categoria: string | null
          concepto: string | null
          creado_en: string | null
          estado_o_saldo: string | null
          fecha: string | null
          metodo_pago: string | null
          movimiento_id: string | null
          notas: string | null
          tipo_movimiento: string | null
          valor_deuda: number | null
          valor_egreso: number | null
          valor_ingreso: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      aplicar_saldo_favor_directo:
        | {
            Args: {
              p_asistente_id: string
              p_cuenta_id: string
              p_monto: number
            }
            Returns: undefined
          }
        | {
            Args: {
              p_asistente_id: string
              p_cuenta_id: string
              p_monto: number
              p_usuario_id: string
            }
            Returns: undefined
          }
      aplicar_saldo_favor_trx: {
        Args: { p_asistente_id: string; p_cuenta_id: string; p_monto: number }
        Returns: undefined
      }
      aplicar_saldo_favor_trx_impl: {
        Args: { p_asistente_id: string; p_cuenta_id: string; p_monto: number }
        Returns: undefined
      }
      fn_cerrar_liquidacion: {
        Args: { p_periodo_id: string }
        Returns: undefined
      }
      fn_cerrar_liquidacion_impl: {
        Args: { p_periodo_id: string }
        Returns: undefined
      }
      mb_current_asistente_id: { Args: never; Returns: string }
      mb_current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["rol_usuario"]
      }
      mb_is_admin: { Args: never; Returns: boolean }
      mb_is_admin_or_caja: { Args: never; Returns: boolean }
      mb_is_consulta_owner: {
        Args: { p_asistente_id: string }
        Returns: boolean
      }
      mcp_resolve_identity: {
        Args: { p_user_id: string }
        Returns: {
          email: string
          role: string
          user_id: string
        }[]
      }
      revertir_abono_con_saldo_trx:
        | {
            Args: { p_abono_id: string; p_cuenta_id: string }
            Returns: undefined
          }
        | {
            Args: {
              p_abono_id: string
              p_cuenta_id: string
              p_usuario_id: string
            }
            Returns: undefined
          }
      revertir_anticipo_trx:
        | {
            Args: { p_anticipo_id: string; p_asistente_id: string }
            Returns: undefined
          }
        | {
            Args: {
              p_anticipo_id: string
              p_asistente_id: string
              p_usuario_id: string
            }
            Returns: undefined
          }
      role_claim: {
        Args: never
        Returns: {
          asistente_id: string
          rol: string
        }[]
      }
    }
    Enums: {
      estado_cuenta: "pendiente" | "parcial" | "pagado"
      estado_periodo: "abierto" | "cerrado"
      metodo_pago: "efectivo" | "nequi" | "daviplata" | "otro" | "saldo_a_favor"
      rol_usuario: "admin" | "caja" | "consulta"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      estado_cuenta: ["pendiente", "parcial", "pagado"],
      estado_periodo: ["abierto", "cerrado"],
      metodo_pago: ["efectivo", "nequi", "daviplata", "otro", "saldo_a_favor"],
      rol_usuario: ["admin", "caja", "consulta"],
    },
  },
} as const
