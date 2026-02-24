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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      absences: {
        Row: {
          absence_type: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          document_url: string | null
          employee_id: string
          end_date: string
          id: string
          notes: string | null
          reason: string | null
          rejection_reason: string | null
          start_date: string
          status: string
          total_days: number | null
          updated_at: string
        }
        Insert: {
          absence_type: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          document_url?: string | null
          employee_id: string
          end_date: string
          id?: string
          notes?: string | null
          reason?: string | null
          rejection_reason?: string | null
          start_date: string
          status?: string
          total_days?: number | null
          updated_at?: string
        }
        Update: {
          absence_type?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          document_url?: string | null
          employee_id?: string
          end_date?: string
          id?: string
          notes?: string | null
          reason?: string | null
          rejection_reason?: string | null
          start_date?: string
          status?: string
          total_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "absences_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      agencias: {
        Row: {
          contacto_email: string | null
          contacto_nombre: string | null
          contacto_telefono: string | null
          created_at: string
          estado: string
          id: string
          instagram: string | null
          nombre: string
          notas: string | null
          pais: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string
          estado?: string
          id?: string
          instagram?: string | null
          nombre: string
          notas?: string | null
          pais?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string
          estado?: string
          id?: string
          instagram?: string | null
          nombre?: string
          notas?: string | null
          pais?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      agenda_share_tokens: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          token?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      applicants: {
        Row: {
          assigned_to: string | null
          availability_date: string | null
          converted_to_employee_id: string | null
          created_at: string
          created_by: string | null
          cv_url: string | null
          department_id: string | null
          email: string | null
          expected_salary: number | null
          full_name: string
          id: string
          interview_date: string | null
          interview_notes: string | null
          linkedin_url: string | null
          notes: string | null
          phone: string | null
          portfolio_url: string | null
          position_applied: string | null
          rejection_reason: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          availability_date?: string | null
          converted_to_employee_id?: string | null
          created_at?: string
          created_by?: string | null
          cv_url?: string | null
          department_id?: string | null
          email?: string | null
          expected_salary?: number | null
          full_name: string
          id?: string
          interview_date?: string | null
          interview_notes?: string | null
          linkedin_url?: string | null
          notes?: string | null
          phone?: string | null
          portfolio_url?: string | null
          position_applied?: string | null
          rejection_reason?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          availability_date?: string | null
          converted_to_employee_id?: string | null
          created_at?: string
          created_by?: string | null
          cv_url?: string | null
          department_id?: string | null
          email?: string | null
          expected_salary?: number | null
          full_name?: string
          id?: string
          interview_date?: string | null
          interview_notes?: string | null
          linkedin_url?: string | null
          notes?: string | null
          phone?: string | null
          portfolio_url?: string | null
          position_applied?: string | null
          rejection_reason?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applicants_converted_to_employee_id_fkey"
            columns: ["converted_to_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applicants_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          check_in: string | null
          check_out: string | null
          created_at: string
          created_by: string | null
          date: string
          employee_id: string
          id: string
          notes: string | null
          shift: string
          shift_end: string | null
          shift_start: string | null
          status: string
          updated_at: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          employee_id: string
          id?: string
          notes?: string | null
          shift?: string
          shift_end?: string | null
          shift_start?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          employee_id?: string
          id?: string
          notes?: string | null
          shift?: string
          shift_end?: string | null
          shift_start?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          area: string | null
          base_amount: number | null
          cost_center: string | null
          created_at: string
          created_by: string | null
          creator_id: string | null
          employee_id: string | null
          estimated_amount: number | null
          final_amount: number | null
          id: string
          notes: string | null
          percentage: number | null
          period: string
          status: string
          updated_at: string
        }
        Insert: {
          area?: string | null
          base_amount?: number | null
          cost_center?: string | null
          created_at?: string
          created_by?: string | null
          creator_id?: string | null
          employee_id?: string | null
          estimated_amount?: number | null
          final_amount?: number | null
          id?: string
          notes?: string | null
          percentage?: number | null
          period: string
          status?: string
          updated_at?: string
        }
        Update: {
          area?: string | null
          base_amount?: number | null
          cost_center?: string | null
          created_at?: string
          created_by?: string | null
          creator_id?: string | null
          employee_id?: string | null
          estimated_amount?: number | null
          final_amount?: number | null
          id?: string
          notes?: string | null
          percentage?: number | null
          period?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      contactos: {
        Row: {
          categoria_fisica: string | null
          compania: string | null
          country_code: string | null
          created_at: string
          email: string | null
          estado: string
          id: string
          instagram: string
          nombre: string
          notas: string | null
          pais: string | null
          profile_photo_url: string | null
          telefono: string | null
          ticket: string | null
          updated_at: string
        }
        Insert: {
          categoria_fisica?: string | null
          compania?: string | null
          country_code?: string | null
          created_at?: string
          email?: string | null
          estado?: string
          id?: string
          instagram: string
          nombre: string
          notas?: string | null
          pais?: string | null
          profile_photo_url?: string | null
          telefono?: string | null
          ticket?: string | null
          updated_at?: string
        }
        Update: {
          categoria_fisica?: string | null
          compania?: string | null
          country_code?: string | null
          created_at?: string
          email?: string | null
          estado?: string
          id?: string
          instagram?: string
          nombre?: string
          notas?: string | null
          pais?: string | null
          profile_photo_url?: string | null
          telefono?: string | null
          ticket?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      creator_assignments: {
        Row: {
          closer_profile_id: string | null
          created_at: string | null
          creator_id: string
          effective_from: string | null
          effective_to: string | null
          id: string
          manager_profile_id: string | null
          specialist_profile_id: string | null
        }
        Insert: {
          closer_profile_id?: string | null
          created_at?: string | null
          creator_id: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          manager_profile_id?: string | null
          specialist_profile_id?: string | null
        }
        Update: {
          closer_profile_id?: string | null
          created_at?: string | null
          creator_id?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          manager_profile_id?: string | null
          specialist_profile_id?: string | null
        }
        Relationships: []
      }
      creator_business: {
        Row: {
          agency_percentage: number | null
          assigned_agency: string | null
          assigned_manager_id: string | null
          assigned_manager_profile_id: string | null
          assigned_specialist_id: string | null
          assigned_specialist_profile_id: string | null
          blue_package: boolean | null
          closer_responsible_id: string | null
          closer_responsible_profile_id: string | null
          created_at: string | null
          creator_id: string
          has_piclink: boolean | null
          id: string
          kash_type: string | null
          last_month_sales: number | null
          last_update_date: string | null
          li_payment_amount: number | null
          main_platform: string | null
          manager_type: string | null
          monthly_sales_target: number | null
          payment_method: string | null
          piclink_env_confirmed: boolean | null
          piclink_monthly_payment: number | null
          platform_username: string | null
          secondary_platform: string | null
          start_date: string | null
          updated_at: string | null
        }
        Insert: {
          agency_percentage?: number | null
          assigned_agency?: string | null
          assigned_manager_id?: string | null
          assigned_manager_profile_id?: string | null
          assigned_specialist_id?: string | null
          assigned_specialist_profile_id?: string | null
          blue_package?: boolean | null
          closer_responsible_id?: string | null
          closer_responsible_profile_id?: string | null
          created_at?: string | null
          creator_id: string
          has_piclink?: boolean | null
          id?: string
          kash_type?: string | null
          last_month_sales?: number | null
          last_update_date?: string | null
          li_payment_amount?: number | null
          main_platform?: string | null
          manager_type?: string | null
          monthly_sales_target?: number | null
          payment_method?: string | null
          piclink_env_confirmed?: boolean | null
          piclink_monthly_payment?: number | null
          platform_username?: string | null
          secondary_platform?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Update: {
          agency_percentage?: number | null
          assigned_agency?: string | null
          assigned_manager_id?: string | null
          assigned_manager_profile_id?: string | null
          assigned_specialist_id?: string | null
          assigned_specialist_profile_id?: string | null
          blue_package?: boolean | null
          closer_responsible_id?: string | null
          closer_responsible_profile_id?: string | null
          created_at?: string | null
          creator_id?: string
          has_piclink?: boolean | null
          id?: string
          kash_type?: string | null
          last_month_sales?: number | null
          last_update_date?: string | null
          li_payment_amount?: number | null
          main_platform?: string | null
          manager_type?: string | null
          monthly_sales_target?: number | null
          payment_method?: string | null
          piclink_env_confirmed?: boolean | null
          piclink_monthly_payment?: number | null
          platform_username?: string | null
          secondary_platform?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_business_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_chatter_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          chatter_profile_id: string
          creator_id: string
          id: string
          is_active: boolean | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          chatter_profile_id: string
          creator_id: string
          id?: string
          is_active?: boolean | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          chatter_profile_id?: string
          creator_id?: string
          id?: string
          is_active?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_chatter_assignments_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_documents: {
        Row: {
          creator_id: string
          description: string | null
          file_name: string
          file_type: string
          file_url: string
          id: string
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          creator_id: string
          description?: string | null
          file_name: string
          file_type: string
          file_url: string
          id?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          creator_id?: string
          description?: string | null
          file_name?: string
          file_type?: string
          file_url?: string
          id?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      creator_guidelines: {
        Row: {
          content: string
          created_at: string | null
          created_by: string
          creator_id: string
          currency: string | null
          guideline_type: string
          id: string
          note: string | null
          price: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by: string
          creator_id: string
          currency?: string | null
          guideline_type: string
          id?: string
          note?: string | null
          price?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string
          creator_id?: string
          currency?: string | null
          guideline_type?: string
          id?: string
          note?: string | null
          price?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      creator_history: {
        Row: {
          action: string
          created_at: string | null
          creator_id: string
          id: string
          new_value: string | null
          old_value: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          creator_id: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          creator_id?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          user_id?: string
        }
        Relationships: []
      }
      creator_monetization: {
        Row: {
          amount: number | null
          created_at: string | null
          created_by: string
          creator_id: string
          id: string
          month_year: string
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          created_by: string
          creator_id: string
          id?: string
          month_year: string
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          created_by?: string
          creator_id?: string
          id?: string
          month_year?: string
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      creator_note_files: {
        Row: {
          created_at: string | null
          file_name: string | null
          file_type: string
          file_url: string
          id: string
          note_id: string
        }
        Insert: {
          created_at?: string | null
          file_name?: string | null
          file_type: string
          file_url: string
          id?: string
          note_id: string
        }
        Update: {
          created_at?: string | null
          file_name?: string | null
          file_type?: string
          file_url?: string
          id?: string
          note_id?: string
        }
        Relationships: []
      }
      creator_notes: {
        Row: {
          created_at: string | null
          created_by: string
          creator_id: string
          id: string
          note_text: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          creator_id: string
          id?: string
          note_text: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          creator_id?: string
          id?: string
          note_text?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      creator_payments: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string
          creator_id: string
          due_date: string
          id: string
          notes: string | null
          paid_date: string | null
          payment_method: string | null
          payment_type: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by: string
          creator_id: string
          due_date: string
          id?: string
          notes?: string | null
          paid_date?: string | null
          payment_method?: string | null
          payment_type?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string
          creator_id?: string
          due_date?: string
          id?: string
          notes?: string | null
          paid_date?: string | null
          payment_method?: string | null
          payment_type?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      creator_prospects: {
        Row: {
          agency: string | null
          category: string | null
          country: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          instagram: string | null
          name: string
          notes: string | null
          phone: string | null
          platform: string | null
          source: string | null
          status: string
          tiktok: string | null
          updated_at: string
        }
        Insert: {
          agency?: string | null
          category?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          instagram?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          platform?: string | null
          source?: string | null
          status?: string
          tiktok?: string | null
          updated_at?: string
        }
        Update: {
          agency?: string | null
          category?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          instagram?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          platform?: string | null
          source?: string | null
          status?: string
          tiktok?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      creator_training: {
        Row: {
          at_risk: boolean | null
          autonomous_since_date: string | null
          call_completed_date: string | null
          call_scheduled_date: string | null
          content_pieces_last_7d: number | null
          created_at: string | null
          creator_id: string
          first_content_date: string | null
          id: string
          last_script_action_date: string | null
          script_status: string | null
          updated_at: string | null
        }
        Insert: {
          at_risk?: boolean | null
          autonomous_since_date?: string | null
          call_completed_date?: string | null
          call_scheduled_date?: string | null
          content_pieces_last_7d?: number | null
          created_at?: string | null
          creator_id: string
          first_content_date?: string | null
          id?: string
          last_script_action_date?: string | null
          script_status?: string | null
          updated_at?: string | null
        }
        Update: {
          at_risk?: boolean | null
          autonomous_since_date?: string | null
          call_completed_date?: string | null
          call_scheduled_date?: string | null
          content_pieces_last_7d?: number | null
          created_at?: string | null
          creator_id?: string
          first_content_date?: string | null
          id?: string
          last_script_action_date?: string | null
          script_status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      creators: {
        Row: {
          age: number | null
          apodos_permitidos: string | null
          artistic_name: string | null
          assigned_manager_id: string | null
          assigned_manager_profile_id: string | null
          assigned_specialist_id: string | null
          assigned_specialist_profile_id: string | null
          bebida_favorita: string | null
          bio: string | null
          birth_date: string | null
          category: string | null
          chat_url: string | null
          cicatrices: string | null
          city: string | null
          closer_responsible_id: string | null
          closer_responsible_profile_id: string | null
          color_favorito: string | null
          comida_favorita: string | null
          como_eres_cuando_nadie_ve: string | null
          como_quieres_que_te_llamen: string | null
          contenido_jamas_haria: string | null
          country: string | null
          country_code: string | null
          created_at: string | null
          currency: string | null
          deporte_equipo: string | null
          dia_perfecto: string | null
          direccion: string | null
          edad_mostrar: number | null
          email: string | null
          emoji_frecuente: string | null
          estado_civil: string | null
          estatura: string | null
          estrategia_material_gratis: string | null
          estrategia_problemas_personales: string | null
          estrategia_rechazo: string | null
          estrategia_recuperacion: string | null
          etnicidad: string | null
          external_transfer: number | null
          frases_venta: string | null
          gfe_disponible: boolean | null
          helado_favorito: string | null
          hermanos: string | null
          hobbies: string | null
          horarios_sueno: string | null
          id: string
          instagram_followers: number | null
          instagram_handle: string | null
          interesa_dinamicas_grupales: boolean | null
          internal_notes: string | null
          languages: string[] | null
          last_autosave_at: string | null
          link_otras_plataformas: string | null
          linkedin_handle: string | null
          mascotas_nombres: string | null
          medidas_cm: string | null
          mejor_atributo_fisico: string | null
          metas_largo_plazo: string | null
          musica_artistas: string | null
          name: string
          nivel_estudios: string | null
          nivel_lectura: string | null
          notes: string | null
          onlyfans_url: string | null
          orientacion_perfil: string | null
          otras_plataformas: string | null
          palabras_prohibidas: string | null
          peliculas_tv: string | null
          permiso_edad_real: boolean | null
          permiso_nombre_real: boolean | null
          permiso_ubicacion: boolean | null
          personalidad_marca: string | null
          phone: string | null
          phone_e164: string | null
          piclink_url: string | null
          plataforma_videollamada: string | null
          precios_contenido: Json | null
          profile_photo_url: string | null
          que_buscas_pareja: string | null
          que_haces_relajarte: string | null
          que_te_hace_reir: string | null
          que_te_incomoda: string | null
          que_te_motiva_crear: string | null
          redes_sociales: string | null
          registration_date: string | null
          respuesta_cuanto_cobra_encuentro: string | null
          respuesta_muestra_intimas: string | null
          respuesta_pedir_desnudos: string | null
          respuesta_sexo_en_persona: string | null
          respuesta_usuario_grosero: string | null
          restricciones_seguridad: string | null
          rutina_diaria: string | null
          schedule_config: Json | null
          segundo_nombre: string | null
          signo_zodiacal: string | null
          source: string | null
          status: string | null
          talla_brasier: string | null
          tatuajes_piercings_detalle: string | null
          terminos_afecto: string | null
          tiktok_handle: string | null
          timezone: string | null
          tono_emocional: string | null
          tono_voz: string | null
          twitter_handle: string | null
          ubicacion_artistica: string | null
          updated_at: string | null
          usuarios_vip: string | null
          viajes_favoritos: string | null
          viajes_por_visitar: string | null
          whatsapp_number: string | null
          wishlist_amazon: string | null
          wishlist_url: string | null
          youtube_handle: string | null
        }
        Insert: {
          age?: number | null
          apodos_permitidos?: string | null
          artistic_name?: string | null
          assigned_manager_id?: string | null
          assigned_manager_profile_id?: string | null
          assigned_specialist_id?: string | null
          assigned_specialist_profile_id?: string | null
          bebida_favorita?: string | null
          bio?: string | null
          birth_date?: string | null
          category?: string | null
          chat_url?: string | null
          cicatrices?: string | null
          city?: string | null
          closer_responsible_id?: string | null
          closer_responsible_profile_id?: string | null
          color_favorito?: string | null
          comida_favorita?: string | null
          como_eres_cuando_nadie_ve?: string | null
          como_quieres_que_te_llamen?: string | null
          contenido_jamas_haria?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          currency?: string | null
          deporte_equipo?: string | null
          dia_perfecto?: string | null
          direccion?: string | null
          edad_mostrar?: number | null
          email?: string | null
          emoji_frecuente?: string | null
          estado_civil?: string | null
          estatura?: string | null
          estrategia_material_gratis?: string | null
          estrategia_problemas_personales?: string | null
          estrategia_rechazo?: string | null
          estrategia_recuperacion?: string | null
          etnicidad?: string | null
          external_transfer?: number | null
          frases_venta?: string | null
          gfe_disponible?: boolean | null
          helado_favorito?: string | null
          hermanos?: string | null
          hobbies?: string | null
          horarios_sueno?: string | null
          id?: string
          instagram_followers?: number | null
          instagram_handle?: string | null
          interesa_dinamicas_grupales?: boolean | null
          internal_notes?: string | null
          languages?: string[] | null
          last_autosave_at?: string | null
          link_otras_plataformas?: string | null
          linkedin_handle?: string | null
          mascotas_nombres?: string | null
          medidas_cm?: string | null
          mejor_atributo_fisico?: string | null
          metas_largo_plazo?: string | null
          musica_artistas?: string | null
          name: string
          nivel_estudios?: string | null
          nivel_lectura?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          orientacion_perfil?: string | null
          otras_plataformas?: string | null
          palabras_prohibidas?: string | null
          peliculas_tv?: string | null
          permiso_edad_real?: boolean | null
          permiso_nombre_real?: boolean | null
          permiso_ubicacion?: boolean | null
          personalidad_marca?: string | null
          phone?: string | null
          phone_e164?: string | null
          piclink_url?: string | null
          plataforma_videollamada?: string | null
          precios_contenido?: Json | null
          profile_photo_url?: string | null
          que_buscas_pareja?: string | null
          que_haces_relajarte?: string | null
          que_te_hace_reir?: string | null
          que_te_incomoda?: string | null
          que_te_motiva_crear?: string | null
          redes_sociales?: string | null
          registration_date?: string | null
          respuesta_cuanto_cobra_encuentro?: string | null
          respuesta_muestra_intimas?: string | null
          respuesta_pedir_desnudos?: string | null
          respuesta_sexo_en_persona?: string | null
          respuesta_usuario_grosero?: string | null
          restricciones_seguridad?: string | null
          rutina_diaria?: string | null
          schedule_config?: Json | null
          segundo_nombre?: string | null
          signo_zodiacal?: string | null
          source?: string | null
          status?: string | null
          talla_brasier?: string | null
          tatuajes_piercings_detalle?: string | null
          terminos_afecto?: string | null
          tiktok_handle?: string | null
          timezone?: string | null
          tono_emocional?: string | null
          tono_voz?: string | null
          twitter_handle?: string | null
          ubicacion_artistica?: string | null
          updated_at?: string | null
          usuarios_vip?: string | null
          viajes_favoritos?: string | null
          viajes_por_visitar?: string | null
          whatsapp_number?: string | null
          wishlist_amazon?: string | null
          wishlist_url?: string | null
          youtube_handle?: string | null
        }
        Update: {
          age?: number | null
          apodos_permitidos?: string | null
          artistic_name?: string | null
          assigned_manager_id?: string | null
          assigned_manager_profile_id?: string | null
          assigned_specialist_id?: string | null
          assigned_specialist_profile_id?: string | null
          bebida_favorita?: string | null
          bio?: string | null
          birth_date?: string | null
          category?: string | null
          chat_url?: string | null
          cicatrices?: string | null
          city?: string | null
          closer_responsible_id?: string | null
          closer_responsible_profile_id?: string | null
          color_favorito?: string | null
          comida_favorita?: string | null
          como_eres_cuando_nadie_ve?: string | null
          como_quieres_que_te_llamen?: string | null
          contenido_jamas_haria?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          currency?: string | null
          deporte_equipo?: string | null
          dia_perfecto?: string | null
          direccion?: string | null
          edad_mostrar?: number | null
          email?: string | null
          emoji_frecuente?: string | null
          estado_civil?: string | null
          estatura?: string | null
          estrategia_material_gratis?: string | null
          estrategia_problemas_personales?: string | null
          estrategia_rechazo?: string | null
          estrategia_recuperacion?: string | null
          etnicidad?: string | null
          external_transfer?: number | null
          frases_venta?: string | null
          gfe_disponible?: boolean | null
          helado_favorito?: string | null
          hermanos?: string | null
          hobbies?: string | null
          horarios_sueno?: string | null
          id?: string
          instagram_followers?: number | null
          instagram_handle?: string | null
          interesa_dinamicas_grupales?: boolean | null
          internal_notes?: string | null
          languages?: string[] | null
          last_autosave_at?: string | null
          link_otras_plataformas?: string | null
          linkedin_handle?: string | null
          mascotas_nombres?: string | null
          medidas_cm?: string | null
          mejor_atributo_fisico?: string | null
          metas_largo_plazo?: string | null
          musica_artistas?: string | null
          name?: string
          nivel_estudios?: string | null
          nivel_lectura?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          orientacion_perfil?: string | null
          otras_plataformas?: string | null
          palabras_prohibidas?: string | null
          peliculas_tv?: string | null
          permiso_edad_real?: boolean | null
          permiso_nombre_real?: boolean | null
          permiso_ubicacion?: boolean | null
          personalidad_marca?: string | null
          phone?: string | null
          phone_e164?: string | null
          piclink_url?: string | null
          plataforma_videollamada?: string | null
          precios_contenido?: Json | null
          profile_photo_url?: string | null
          que_buscas_pareja?: string | null
          que_haces_relajarte?: string | null
          que_te_hace_reir?: string | null
          que_te_incomoda?: string | null
          que_te_motiva_crear?: string | null
          redes_sociales?: string | null
          registration_date?: string | null
          respuesta_cuanto_cobra_encuentro?: string | null
          respuesta_muestra_intimas?: string | null
          respuesta_pedir_desnudos?: string | null
          respuesta_sexo_en_persona?: string | null
          respuesta_usuario_grosero?: string | null
          restricciones_seguridad?: string | null
          rutina_diaria?: string | null
          schedule_config?: Json | null
          segundo_nombre?: string | null
          signo_zodiacal?: string | null
          source?: string | null
          status?: string | null
          talla_brasier?: string | null
          tatuajes_piercings_detalle?: string | null
          terminos_afecto?: string | null
          tiktok_handle?: string | null
          timezone?: string | null
          tono_emocional?: string | null
          tono_voz?: string | null
          twitter_handle?: string | null
          ubicacion_artistica?: string | null
          updated_at?: string | null
          usuarios_vip?: string | null
          viajes_favoritos?: string | null
          viajes_por_visitar?: string | null
          whatsapp_number?: string | null
          wishlist_amazon?: string | null
          wishlist_url?: string | null
          youtube_handle?: string | null
        }
        Relationships: []
      }
      deals: {
        Row: {
          assigned_to: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          prospect_handle: string
          source: string
          stage: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          prospect_handle: string
          source?: string
          stage?: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          prospect_handle?: string
          source?: string
          stage?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          created_at: string
          description: string | null
          head_employee_id: string | null
          id: string
          is_active: boolean
          name: string
          parent_department_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          head_employee_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          parent_department_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          head_employee_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parent_department_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_parent_department_id_fkey"
            columns: ["parent_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_deductions: {
        Row: {
          amount: number
          applied_at: string | null
          created_at: string
          created_by: string | null
          deduction_type: string
          description: string | null
          employee_id: string
          id: string
          month_year: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          applied_at?: string | null
          created_at?: string
          created_by?: string | null
          deduction_type: string
          description?: string | null
          employee_id: string
          id?: string
          month_year: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          applied_at?: string | null
          created_at?: string
          created_by?: string | null
          deduction_type?: string
          description?: string | null
          employee_id?: string
          id?: string
          month_year?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_deductions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          description: string | null
          document_type: string
          employee_id: string
          expiration_date: string | null
          file_name: string
          file_type: string | null
          file_url: string
          id: string
          is_confidential: boolean | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          description?: string | null
          document_type: string
          employee_id: string
          expiration_date?: string | null
          file_name: string
          file_type?: string | null
          file_url: string
          id?: string
          is_confidential?: boolean | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          description?: string | null
          document_type?: string
          employee_id?: string
          expiration_date?: string | null
          file_name?: string
          file_type?: string | null
          file_url?: string
          id?: string
          is_confidential?: boolean | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_history: {
        Row: {
          change_type: string
          created_at: string
          created_by: string | null
          effective_date: string
          employee_id: string
          field_changed: string
          id: string
          new_value: string | null
          notes: string | null
          old_value: string | null
          reason: string | null
        }
        Insert: {
          change_type: string
          created_at?: string
          created_by?: string | null
          effective_date?: string
          employee_id: string
          field_changed: string
          id?: string
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
          reason?: string | null
        }
        Update: {
          change_type?: string
          created_at?: string
          created_by?: string | null
          effective_date?: string
          employee_id?: string
          field_changed?: string
          id?: string
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_incidents: {
        Row: {
          category: string | null
          corrective_action: string | null
          created_at: string
          created_by: string | null
          description: string | null
          document_url: string | null
          employee_id: string
          follow_up_date: string | null
          follow_up_notes: string | null
          follow_up_responsible: string | null
          id: string
          impact: string | null
          incident_date: string
          incident_type: string
          internal_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          corrective_action?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_url?: string | null
          employee_id: string
          follow_up_date?: string | null
          follow_up_notes?: string | null
          follow_up_responsible?: string | null
          id?: string
          impact?: string | null
          incident_date: string
          incident_type: string
          internal_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          corrective_action?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_url?: string | null
          employee_id?: string
          follow_up_date?: string | null
          follow_up_notes?: string | null
          follow_up_responsible?: string | null
          id?: string
          impact?: string | null
          incident_date?: string
          incident_type?: string
          internal_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_incidents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_offboarding: {
        Row: {
          access_revoked: boolean | null
          created_at: string
          created_by: string | null
          employee_id: string
          equipment_returned: boolean | null
          exit_interview_date: string | null
          exit_interview_notes: string | null
          final_payment_status: string | null
          id: string
          status: string
          termination_date: string
          termination_reason: string | null
          termination_type: string
          updated_at: string
        }
        Insert: {
          access_revoked?: boolean | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          equipment_returned?: boolean | null
          exit_interview_date?: string | null
          exit_interview_notes?: string | null
          final_payment_status?: string | null
          id?: string
          status?: string
          termination_date: string
          termination_reason?: string | null
          termination_type?: string
          updated_at?: string
        }
        Update: {
          access_revoked?: boolean | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          equipment_returned?: boolean | null
          exit_interview_date?: string | null
          exit_interview_notes?: string | null
          final_payment_status?: string | null
          id?: string
          status?: string
          termination_date?: string
          termination_reason?: string | null
          termination_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_offboarding_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_onboarding: {
        Row: {
          buddy_employee_id: string | null
          completion_date: string | null
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          buddy_employee_id?: string | null
          completion_date?: string | null
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          buddy_employee_id?: string | null
          completion_date?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_onboarding_buddy_employee_id_fkey"
            columns: ["buddy_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_onboarding_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_onboarding_tasks: {
        Row: {
          category: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          onboarding_id: string
          position: number
          status: string
          title: string
        }
        Insert: {
          category?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          onboarding_id: string
          position?: number
          status?: string
          title: string
        }
        Update: {
          category?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          onboarding_id?: string
          position?: number
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_onboarding_tasks_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "employee_onboarding"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_training_assignments: {
        Row: {
          assigned_by: string | null
          certificate_url: string | null
          completion_date: string | null
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          score: number | null
          start_date: string | null
          status: string
          training_program_id: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          certificate_url?: string | null
          completion_date?: string | null
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          score?: number | null
          start_date?: string | null
          status?: string
          training_program_id: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          certificate_url?: string | null
          completion_date?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          score?: number | null
          start_date?: string | null
          status?: string
          training_program_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_training_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_training_assignments_training_program_id_fkey"
            columns: ["training_program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          afp: string | null
          arl: string | null
          bank_account_number: string | null
          bank_account_type: string | null
          bank_name: string | null
          base_salary: number | null
          birth_date: string | null
          caja_compensacion: string | null
          city: string | null
          company_id: string | null
          contract_type: string | null
          country: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          employee_code: string | null
          eps: string | null
          first_name: string
          gender: string | null
          hire_date: string | null
          id: string
          internal_notes: string | null
          last_name: string
          mobile: string | null
          national_id: string | null
          national_id_type: string | null
          nationality: string | null
          notes: string | null
          phone: string | null
          position_id: string | null
          profile_id: string | null
          profile_photo_url: string | null
          reports_to: string | null
          salary_frequency: string | null
          status: string
          termination_date: string | null
          updated_at: string
          work_modality: string | null
        }
        Insert: {
          address?: string | null
          afp?: string | null
          arl?: string | null
          bank_account_number?: string | null
          bank_account_type?: string | null
          bank_name?: string | null
          base_salary?: number | null
          birth_date?: string | null
          caja_compensacion?: string | null
          city?: string | null
          company_id?: string | null
          contract_type?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_code?: string | null
          eps?: string | null
          first_name: string
          gender?: string | null
          hire_date?: string | null
          id?: string
          internal_notes?: string | null
          last_name: string
          mobile?: string | null
          national_id?: string | null
          national_id_type?: string | null
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          position_id?: string | null
          profile_id?: string | null
          profile_photo_url?: string | null
          reports_to?: string | null
          salary_frequency?: string | null
          status?: string
          termination_date?: string | null
          updated_at?: string
          work_modality?: string | null
        }
        Update: {
          address?: string | null
          afp?: string | null
          arl?: string | null
          bank_account_number?: string | null
          bank_account_type?: string | null
          bank_name?: string | null
          base_salary?: number | null
          birth_date?: string | null
          caja_compensacion?: string | null
          city?: string | null
          company_id?: string | null
          contract_type?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_code?: string | null
          eps?: string | null
          first_name?: string
          gender?: string | null
          hire_date?: string | null
          id?: string
          internal_notes?: string | null
          last_name?: string
          mobile?: string | null
          national_id?: string | null
          national_id_type?: string | null
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          position_id?: string | null
          profile_id?: string | null
          profile_photo_url?: string | null
          reports_to?: string | null
          salary_frequency?: string | null
          status?: string
          termination_date?: string | null
          updated_at?: string
          work_modality?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendance_log: {
        Row: {
          changed_by: string | null
          created_at: string | null
          event_guest_id: string
          event_id: string
          id: string
          new_status: string
          notes: string | null
          old_status: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          event_guest_id: string
          event_id: string
          id?: string
          new_status: string
          notes?: string | null
          old_status?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          event_guest_id?: string
          event_id?: string
          id?: string
          new_status?: string
          notes?: string | null
          old_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_attendance_log_event_guest_id_fkey"
            columns: ["event_guest_id"]
            isOneToOne: false
            referencedRelation: "event_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_checklist_items: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          event_id: string
          id: string
          notes: string | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          event_id: string
          id?: string
          notes?: string | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          event_id?: string
          id?: string
          notes?: string | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_checklist_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_guests: {
        Row: {
          cancellation_reason: string | null
          created_at: string
          creator_id: string | null
          email: string | null
          event_id: string
          guest_name: string | null
          guest_type: string
          id: string
          phone: string | null
          status: string
          status_changed_by: string | null
          status_updated_at: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          created_at?: string
          creator_id?: string | null
          email?: string | null
          event_id: string
          guest_name?: string | null
          guest_type?: string
          id?: string
          phone?: string | null
          status?: string
          status_changed_by?: string | null
          status_updated_at?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          created_at?: string
          creator_id?: string | null
          email?: string | null
          event_id?: string
          guest_name?: string | null
          guest_type?: string
          id?: string
          phone?: string | null
          status?: string
          status_changed_by?: string | null
          status_updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_guests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_guests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          description: string | null
          end_date: string | null
          end_time: string | null
          event_type: string
          external_link_expires_at: string | null
          external_token: string | null
          id: string
          internal_token: string | null
          location: string | null
          max_capacity: number | null
          name: string
          notes: string | null
          project_type: string | null
          start_time: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          event_type: string
          external_link_expires_at?: string | null
          external_token?: string | null
          id?: string
          internal_token?: string | null
          location?: string | null
          max_capacity?: number | null
          name: string
          notes?: string | null
          project_type?: string | null
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          event_type?: string
          external_link_expires_at?: string | null
          external_token?: string | null
          id?: string
          internal_token?: string | null
          location?: string | null
          max_capacity?: number | null
          name?: string
          notes?: string | null
          project_type?: string | null
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      financial_reports: {
        Row: {
          area: string | null
          cost_center: string | null
          created_at: string
          file_url: string | null
          format: string | null
          generated_by: string | null
          id: string
          period_from: string | null
          period_to: string | null
          report_type: string
        }
        Insert: {
          area?: string | null
          cost_center?: string | null
          created_at?: string
          file_url?: string | null
          format?: string | null
          generated_by?: string | null
          id?: string
          period_from?: string | null
          period_to?: string | null
          report_type: string
        }
        Update: {
          area?: string | null
          cost_center?: string | null
          created_at?: string
          file_url?: string | null
          format?: string | null
          generated_by?: string | null
          id?: string
          period_from?: string | null
          period_to?: string | null
          report_type?: string
        }
        Relationships: []
      }
      hour_bank: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string
          hours: number
          id: string
          movement_type: string
          reason: string | null
          reference_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id: string
          hours: number
          id?: string
          movement_type?: string
          reason?: string | null
          reference_date?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string
          hours?: number
          id?: string
          movement_type?: string
          reason?: string | null
          reference_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "hour_bank_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          creator_id: string | null
          due_date: string | null
          fee_amount: number | null
          fee_type: string | null
          id: string
          invoice_number: string
          net_amount: number | null
          notes: string | null
          paid_date: string | null
          payment_method: string | null
          reversal_reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          creator_id?: string | null
          due_date?: string | null
          fee_amount?: number | null
          fee_type?: string | null
          id?: string
          invoice_number?: string
          net_amount?: number | null
          notes?: string | null
          paid_date?: string | null
          payment_method?: string | null
          reversal_reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          creator_id?: string | null
          due_date?: string | null
          fee_amount?: number | null
          fee_type?: string | null
          id?: string
          invoice_number?: string
          net_amount?: number | null
          notes?: string | null
          paid_date?: string | null
          payment_method?: string | null
          reversal_reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          note_text: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          note_text: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          note_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          categoria: string
          compania: string
          created_at: string
          evidence_urls: string[] | null
          id: string
          notas: string | null
          pais: string | null
          plataforma: string
          status: string
          updated_at: string
          url_perfil: string
        }
        Insert: {
          categoria: string
          compania: string
          created_at?: string
          evidence_urls?: string[] | null
          id?: string
          notas?: string | null
          pais?: string | null
          plataforma: string
          status?: string
          updated_at?: string
          url_perfil: string
        }
        Update: {
          categoria?: string
          compania?: string
          created_at?: string
          evidence_urls?: string[] | null
          id?: string
          notas?: string | null
          pais?: string | null
          plataforma?: string
          status?: string
          updated_at?: string
          url_perfil?: string
        }
        Relationships: []
      }
      missing_creatos_id_of_gross_earnings: {
        Row: {
          created_at: string
          Creator: string | null
          id: number
        }
        Insert: {
          created_at?: string
          Creator?: string | null
          id?: number
        }
        Update: {
          created_at?: string
          Creator?: string | null
          id?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          reference_id: string | null
          reference_type: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      of_gross_earnings: {
        Row: {
          active_fans: number | null
          avg_earnings_per_fan_gross: number | null
          avg_spend_per_spender_gross: number | null
          avg_spend_per_transaction_gross: number | null
          avg_subscription_length: string | null
          change_expired_fan_count: number | null
          contribution: number | null
          created_at: string | null
          creator_group: string | null
          creator_id: string | null
          date: string
          document_id: string | null
          fans_renew_on: number | null
          following: number | null
          id: string
          message_gross: number | null
          new_fans: number | null
          new_subscriptions_sub_gross: number | null
          of_ranking: number | null
          pending_creator: string | null
          recurring_sub_gross: number | null
          renew_on_percentage: number | null
          subscription_gross: number | null
          tips_gross: number | null
          total_earnings_gross: number | null
          updated_at: string | null
        }
        Insert: {
          active_fans?: number | null
          avg_earnings_per_fan_gross?: number | null
          avg_spend_per_spender_gross?: number | null
          avg_spend_per_transaction_gross?: number | null
          avg_subscription_length?: string | null
          change_expired_fan_count?: number | null
          contribution?: number | null
          created_at?: string | null
          creator_group?: string | null
          creator_id?: string | null
          date: string
          document_id?: string | null
          fans_renew_on?: number | null
          following?: number | null
          id?: string
          message_gross?: number | null
          new_fans?: number | null
          new_subscriptions_sub_gross?: number | null
          of_ranking?: number | null
          pending_creator?: string | null
          recurring_sub_gross?: number | null
          renew_on_percentage?: number | null
          subscription_gross?: number | null
          tips_gross?: number | null
          total_earnings_gross?: number | null
          updated_at?: string | null
        }
        Update: {
          active_fans?: number | null
          avg_earnings_per_fan_gross?: number | null
          avg_spend_per_spender_gross?: number | null
          avg_spend_per_transaction_gross?: number | null
          avg_subscription_length?: string | null
          change_expired_fan_count?: number | null
          contribution?: number | null
          created_at?: string | null
          creator_group?: string | null
          creator_id?: string | null
          date?: string
          document_id?: string | null
          fans_renew_on?: number | null
          following?: number | null
          id?: string
          message_gross?: number | null
          new_fans?: number | null
          new_subscriptions_sub_gross?: number | null
          of_ranking?: number | null
          pending_creator?: string | null
          recurring_sub_gross?: number | null
          renew_on_percentage?: number | null
          subscription_gross?: number | null
          tips_gross?: number | null
          total_earnings_gross?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      overtime: {
        Row: {
          amount_calculated: number | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          date: string
          employee_id: string
          hours: number
          id: string
          notes: string | null
          overtime_type: string
          rate_multiplier: number | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_calculated?: number | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          employee_id: string
          hours: number
          id?: string
          notes?: string | null
          overtime_type?: string
          rate_multiplier?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_calculated?: number | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          employee_id?: string
          hours?: number
          id?: string
          notes?: string | null
          overtime_type?: string
          rate_multiplier?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "overtime_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_details: {
        Row: {
          base_salary: number | null
          commission_amount: number | null
          created_at: string
          deductions_total: number | null
          employee_id: string
          gross_total: number | null
          hour_bank_amount: number | null
          hour_bank_hours: number | null
          id: string
          net_total: number | null
          notes: string | null
          overtime_amount: number | null
          overtime_hours: number | null
          payroll_period_id: string
        }
        Insert: {
          base_salary?: number | null
          commission_amount?: number | null
          created_at?: string
          deductions_total?: number | null
          employee_id: string
          gross_total?: number | null
          hour_bank_amount?: number | null
          hour_bank_hours?: number | null
          id?: string
          net_total?: number | null
          notes?: string | null
          overtime_amount?: number | null
          overtime_hours?: number | null
          payroll_period_id: string
        }
        Update: {
          base_salary?: number | null
          commission_amount?: number | null
          created_at?: string
          deductions_total?: number | null
          employee_id?: string
          gross_total?: number | null
          hour_bank_amount?: number | null
          hour_bank_hours?: number | null
          id?: string
          net_total?: number | null
          notes?: string | null
          overtime_amount?: number | null
          overtime_hours?: number | null
          payroll_period_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_details_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_details_payroll_period_id_fkey"
            columns: ["payroll_period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          area: string | null
          calculated_at: string | null
          closed_at: string | null
          cost_center: string | null
          created_at: string
          created_by: string | null
          end_date: string
          gross_total: number | null
          id: string
          net_total: number | null
          notes: string | null
          paid_at: string | null
          period_name: string
          start_date: string
          status: string
          total_employees: number | null
          updated_at: string
        }
        Insert: {
          area?: string | null
          calculated_at?: string | null
          closed_at?: string | null
          cost_center?: string | null
          created_at?: string
          created_by?: string | null
          end_date: string
          gross_total?: number | null
          id?: string
          net_total?: number | null
          notes?: string | null
          paid_at?: string | null
          period_name: string
          start_date: string
          status?: string
          total_employees?: number | null
          updated_at?: string
        }
        Update: {
          area?: string | null
          calculated_at?: string | null
          closed_at?: string | null
          cost_center?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string
          gross_total?: number | null
          id?: string
          net_total?: number | null
          notes?: string | null
          paid_at?: string | null
          period_name?: string
          start_date?: string
          status?: string
          total_employees?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      performance_evaluations: {
        Row: {
          areas_for_improvement: string | null
          comments: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          evaluation_date: string
          evaluator_id: string | null
          goals_next_period: string | null
          id: string
          initiative_score: number | null
          overall_score: number | null
          period: string
          punctuality_score: number | null
          quality_score: number | null
          status: string
          strengths: string | null
          teamwork_score: number | null
          updated_at: string
        }
        Insert: {
          areas_for_improvement?: string | null
          comments?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          evaluation_date: string
          evaluator_id?: string | null
          goals_next_period?: string | null
          id?: string
          initiative_score?: number | null
          overall_score?: number | null
          period: string
          punctuality_score?: number | null
          quality_score?: number | null
          status?: string
          strengths?: string | null
          teamwork_score?: number | null
          updated_at?: string
        }
        Update: {
          areas_for_improvement?: string | null
          comments?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          evaluation_date?: string
          evaluator_id?: string | null
          goals_next_period?: string | null
          id?: string
          initiative_score?: number | null
          overall_score?: number | null
          period?: string
          punctuality_score?: number | null
          quality_score?: number | null
          status?: string
          strengths?: string | null
          teamwork_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_evaluations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          code: string
          created_at: string
          department_id: string | null
          description: string | null
          id: string
          is_active: boolean
          max_salary: number | null
          min_salary: number | null
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          max_salary?: number | null
          min_salary?: number | null
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          max_salary?: number | null
          min_salary?: number | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "task_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      promolog_campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          creator_id: string
          goal_monthly: number
          goal_weekly: number
          id: string
          month_year: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          creator_id: string
          goal_monthly?: number
          goal_weekly?: number
          id?: string
          month_year: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          creator_id?: string
          goal_monthly?: number
          goal_weekly?: number
          id?: string
          month_year?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promolog_campaigns_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      promolog_entries: {
        Row: {
          action_taken: string | null
          buy_link_type: string | null
          contact_type: string | null
          created_at: string | null
          creator_id: string
          date: string
          evidence_url: string | null
          has_buy_link: boolean | null
          id: string
          network: string
          notes: string | null
          platform: string | null
          promoted: string | null
          reviewed_by: string | null
          ticket_number: string | null
          updated_at: string | null
        }
        Insert: {
          action_taken?: string | null
          buy_link_type?: string | null
          contact_type?: string | null
          created_at?: string | null
          creator_id: string
          date: string
          evidence_url?: string | null
          has_buy_link?: boolean | null
          id?: string
          network: string
          notes?: string | null
          platform?: string | null
          promoted?: string | null
          reviewed_by?: string | null
          ticket_number?: string | null
          updated_at?: string | null
        }
        Update: {
          action_taken?: string | null
          buy_link_type?: string | null
          contact_type?: string | null
          created_at?: string | null
          creator_id?: string
          date?: string
          evidence_url?: string | null
          has_buy_link?: boolean | null
          id?: string
          network?: string
          notes?: string | null
          platform?: string | null
          promoted?: string | null
          reviewed_by?: string | null
          ticket_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promolog_entries_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
        }
        Relationships: []
      }
      roadmap_items: {
        Row: {
          category_id: string
          completed_at: string | null
          created_at: string
          delivery_date: string | null
          description: string | null
          id: string
          position: number
          status: string
          submodule: string | null
          task: string
          updated_at: string
        }
        Insert: {
          category_id: string
          completed_at?: string | null
          created_at?: string
          delivery_date?: string | null
          description?: string | null
          id?: string
          position?: number
          status?: string
          submodule?: string | null
          task: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          completed_at?: string | null
          created_at?: string
          delivery_date?: string | null
          description?: string | null
          id?: string
          position?: number
          status?: string
          submodule?: string | null
          task?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "roadmap_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          can_access: boolean
          created_at: string
          data_scope: string
          id: string
          module: string
          role_id: string
          submodule: string | null
        }
        Insert: {
          can_access?: boolean
          created_at?: string
          data_scope?: string
          id?: string
          module: string
          role_id: string
          submodule?: string | null
        }
        Update: {
          can_access?: boolean
          created_at?: string
          data_scope?: string
          id?: string
          module?: string
          role_id?: string
          submodule?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles_config"
            referencedColumns: ["id"]
          },
        ]
      }
      roles_config: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      subtask_assignees: {
        Row: {
          created_at: string | null
          id: string
          subtask_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          subtask_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          subtask_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtask_assignees_subtask_id_fkey"
            columns: ["subtask_id"]
            isOneToOne: false
            referencedRelation: "subtasks"
            referencedColumns: ["id"]
          },
        ]
      }
      subtasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_at: string | null
          id: string
          parent_subtask_id: string | null
          position: number
          priority: string
          start_at: string | null
          started_at: string | null
          status: string
          task_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_at?: string | null
          id?: string
          parent_subtask_id?: string | null
          position?: number
          priority?: string
          start_at?: string | null
          started_at?: string | null
          status?: string
          task_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          id?: string
          parent_subtask_id?: string | null
          position?: number
          priority?: string
          start_at?: string | null
          started_at?: string | null
          status?: string
          task_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtasks_parent_subtask_id_fkey"
            columns: ["parent_subtask_id"]
            isOneToOne: false
            referencedRelation: "subtasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subtasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          created_at: string | null
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_projects: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          name: string
          position: number
          share_token: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          name: string
          position?: number
          share_token?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          position?: number
          share_token?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string
          company_id: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string
          description: string | null
          due_at: string
          duration_hours: number
          duration_minutes: number
          id: string
          overdue_reason: string | null
          position: number
          priority: string
          project_id: string | null
          share_token: string | null
          start_at: string | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to: string
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          due_at: string
          duration_hours?: number
          duration_minutes?: number
          id?: string
          overdue_reason?: string | null
          position?: number
          priority?: string
          project_id?: string | null
          share_token?: string | null
          start_at?: string | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          due_at?: string
          duration_hours?: number
          duration_minutes?: number
          id?: string
          overdue_reason?: string | null
          position?: number
          priority?: string
          project_id?: string | null
          share_token?: string | null
          start_at?: string | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "task_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          author_email: string | null
          author_name: string
          content: string
          created_at: string | null
          id: string
          ticket_id: string
        }
        Insert: {
          author_email?: string | null
          author_name: string
          content: string
          created_at?: string | null
          id?: string
          ticket_id: string
        }
        Update: {
          author_email?: string | null
          author_name?: string
          content?: string
          created_at?: string | null
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to: string | null
          company: string | null
          created_at: string | null
          creator_id: string
          creator_notes: string | null
          description: string | null
          id: string
          priority: string
          status: string
          ticket_type: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          company?: string | null
          created_at?: string | null
          creator_id: string
          creator_notes?: string | null
          description?: string | null
          id?: string
          priority?: string
          status?: string
          ticket_type?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          company?: string | null
          created_at?: string | null
          creator_id?: string
          creator_notes?: string | null
          description?: string | null
          id?: string
          priority?: string
          status?: string
          ticket_type?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      time_bank: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          description: string | null
          employee_id: string
          entry_type: string
          hours: number
          id: string
          reference_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          description?: string | null
          employee_id: string
          entry_type: string
          hours: number
          id?: string
          reference_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          employee_id?: string
          entry_type?: string
          hours?: number
          id?: string
          reference_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_bank_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      time_bank_balances: {
        Row: {
          balance_hours: number | null
          employee_id: string
          id: string
          last_updated: string
          total_hours_earned: number
          total_hours_used: number
        }
        Insert: {
          balance_hours?: number | null
          employee_id: string
          id?: string
          last_updated?: string
          total_hours_earned?: number
          total_hours_used?: number
        }
        Update: {
          balance_hours?: number | null
          employee_id?: string
          id?: string
          last_updated?: string
          total_hours_earned?: number
          total_hours_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "time_bank_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      training_module_progress: {
        Row: {
          assignment_id: string
          completed_at: string | null
          created_at: string
          id: string
          module_id: string
          notes: string | null
          score: number | null
          status: string
          updated_at: string
        }
        Insert: {
          assignment_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          module_id: string
          notes?: string | null
          score?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          module_id?: string
          notes?: string | null
          score?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_module_progress_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "employee_training_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_module_progress_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      training_modules: {
        Row: {
          content_type: string | null
          content_url: string | null
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          is_required: boolean
          position: number
          title: string
          training_program_id: string
          updated_at: string
        }
        Insert: {
          content_type?: string | null
          content_url?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_required?: boolean
          position?: number
          title: string
          training_program_id: string
          updated_at?: string
        }
        Update: {
          content_type?: string | null
          content_url?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_required?: boolean
          position?: number
          title?: string
          training_program_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_modules_training_program_id_fkey"
            columns: ["training_program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      training_programs: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_hours: number | null
          id: string
          is_active: boolean | null
          is_mandatory: boolean | null
          modality: string | null
          name: string
          provider: string | null
          target_role: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_hours?: number | null
          id?: string
          is_active?: boolean | null
          is_mandatory?: boolean | null
          modality?: string | null
          name: string
          provider?: string | null
          target_role?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_hours?: number | null
          id?: string
          is_active?: boolean | null
          is_mandatory?: boolean | null
          modality?: string | null
          name?: string
          provider?: string | null
          target_role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whaticket_links: {
        Row: {
          created_at: string
          creator_id: string
          id: string
          updated_at: string
          whaticket_url: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          id?: string
          updated_at?: string
          whaticket_url: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          id?: string
          updated_at?: string
          whaticket_url?: string
        }
        Relationships: []
      }
      work_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          end_date: string
          end_time: string | null
          id: string
          schedule_type: string
          start_date: string
          start_time: string | null
          team: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          end_date: string
          end_time?: string | null
          id?: string
          schedule_type?: string
          start_date: string
          start_time?: string | null
          team?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          end_date?: string
          end_time?: string | null
          id?: string
          schedule_type?: string
          start_date?: string
          start_time?: string | null
          team?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_schedules_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_agenda_by_share_token: {
        Args: { p_token: string }
        Returns: {
          date: string
          description: string
          end_time: string
          event_type: string
          guests: Json
          id: string
          location: string
          name: string
          project_type: string
          start_time: string
          status: string
        }[]
      }
      get_project_by_share_token: {
        Args: { _token: string }
        Returns: {
          company_id: string | null
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          name: string
          position: number
          share_token: string | null
          status: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "task_projects"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_task_by_share_token: {
        Args: { _token: string }
        Returns: {
          assigned_to: string
          company_id: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string
          description: string | null
          due_at: string
          duration_hours: number
          duration_minutes: number
          id: string
          overdue_reason: string | null
          position: number
          priority: string
          project_id: string | null
          share_token: string | null
          start_at: string | null
          status: string
          title: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_tasks_by_project_share_token: {
        Args: { _token: string }
        Returns: {
          assigned_to: string
          company_id: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string
          description: string | null
          due_at: string
          duration_hours: number
          duration_minutes: number
          id: string
          overdue_reason: string | null
          position: number
          priority: string
          project_id: string | null
          share_token: string | null
          start_at: string | null
          status: string
          title: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_project_creator: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_tasks_in_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "employee"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "manager", "employee"],
    },
  },
} as const
