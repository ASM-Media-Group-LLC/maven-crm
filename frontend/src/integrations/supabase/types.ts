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
          {
            foreignKeyName: "absences_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
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
      agencies: {
        Row: {
          contact_name: string | null
          country_code: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          status: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          contact_name?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          contact_name?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
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
      ai_interactions: {
        Row: {
          created_at: string | null
          id_mensaje: string
          perfil_id: string | null
          reasoning_message: string | null
          texto_mensaje: string | null
          tipo_mensaje: string | null
        }
        Insert: {
          created_at?: string | null
          id_mensaje?: string
          perfil_id?: string | null
          reasoning_message?: string | null
          texto_mensaje?: string | null
          tipo_mensaje?: string | null
        }
        Update: {
          created_at?: string | null
          id_mensaje?: string
          perfil_id?: string | null
          reasoning_message?: string | null
          texto_mensaje?: string | null
          tipo_mensaje?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_history_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "ai_leadgenerator"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_leadgenerator: {
        Row: {
          active_following: boolean | null
          bio_completa: string | null
          category: string | null
          city: string | null
          country: string | null
          created_at: string | null
          date: string | null
          exclusive_content: boolean | null
          followers_num: number | null
          following_num: number | null
          has_replied: boolean | null
          ia_reason: string | null
          ia_score: number | null
          ia_status: string | null
          id: string
          link_bio: string | null
          number_followups: number | null
          posts_num: number | null
          source_text: string | null
          update_follow_up_date: string | null
          updated_at: string | null
          url_ig: string | null
          username: string | null
          username_ocr: string | null
        }
        Insert: {
          active_following?: boolean | null
          bio_completa?: string | null
          category?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          date?: string | null
          exclusive_content?: boolean | null
          followers_num?: number | null
          following_num?: number | null
          has_replied?: boolean | null
          ia_reason?: string | null
          ia_score?: number | null
          ia_status?: string | null
          id?: string
          link_bio?: string | null
          number_followups?: number | null
          posts_num?: number | null
          source_text?: string | null
          update_follow_up_date?: string | null
          updated_at?: string | null
          url_ig?: string | null
          username?: string | null
          username_ocr?: string | null
        }
        Update: {
          active_following?: boolean | null
          bio_completa?: string | null
          category?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          date?: string | null
          exclusive_content?: boolean | null
          followers_num?: number | null
          following_num?: number | null
          has_replied?: boolean | null
          ia_reason?: string | null
          ia_score?: number | null
          ia_status?: string | null
          id?: string
          link_bio?: string | null
          number_followups?: number | null
          posts_num?: number | null
          source_text?: string | null
          update_follow_up_date?: string | null
          updated_at?: string | null
          url_ig?: string | null
          username?: string | null
          username_ocr?: string | null
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
      announcement_audience: {
        Row: {
          announcement_id: string
          created_at: string
          id: string
          target_id: string | null
          target_label: string
          target_type: string
        }
        Insert: {
          announcement_id: string
          created_at?: string
          id?: string
          target_id?: string | null
          target_label: string
          target_type: string
        }
        Update: {
          announcement_id?: string
          created_at?: string
          id?: string
          target_id?: string | null
          target_label?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_audience_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "internal_announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_views: {
        Row: {
          announcement_id: string
          id: string
          opened_at: string | null
          user_id: string
          viewed_at: string
        }
        Insert: {
          announcement_id: string
          id?: string
          opened_at?: string | null
          user_id: string
          viewed_at?: string
        }
        Update: {
          announcement_id?: string
          id?: string
          opened_at?: string | null
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_views_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "internal_announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      api_provider_caps: {
        Row: {
          amber_pct: number
          cost_usd_cap_monthly: number
          notes: string | null
          provider: string
          red_pct: number
          updated_at: string
        }
        Insert: {
          amber_pct?: number
          cost_usd_cap_monthly: number
          notes?: string | null
          provider: string
          red_pct?: number
          updated_at?: string
        }
        Update: {
          amber_pct?: number
          cost_usd_cap_monthly?: number
          notes?: string | null
          provider?: string
          red_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      api_usage_log: {
        Row: {
          context: Json
          cost_usd: number
          id: string
          model: string | null
          occurred_at: string
          operation: string
          provider: string
          tenant_id: string | null
          units: Json
        }
        Insert: {
          context?: Json
          cost_usd?: number
          id?: string
          model?: string | null
          occurred_at?: string
          operation: string
          provider: string
          tenant_id?: string | null
          units?: Json
        }
        Update: {
          context?: Json
          cost_usd?: number
          id?: string
          model?: string | null
          occurred_at?: string
          operation?: string
          provider?: string
          tenant_id?: string | null
          units?: Json
        }
        Relationships: []
      }
      app_flags: {
        Row: {
          enabled: boolean
          key: string
          note: string | null
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          key: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          key?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: []
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
            foreignKeyName: "applicants_converted_to_employee_id_fkey"
            columns: ["converted_to_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
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
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          target_id: string | null
          target_type: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string
          user_id?: string
        }
        Relationships: []
      }
      blu_bridge_state: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      blu_creator_map: {
        Row: {
          blu_name: string
          confirmed_at: string
          confirmed_by: string | null
          creator_id: string | null
          status: string
        }
        Insert: {
          blu_name: string
          confirmed_at?: string
          confirmed_by?: string | null
          creator_id?: string | null
          status?: string
        }
        Update: {
          blu_name?: string
          confirmed_at?: string
          confirmed_by?: string | null
          creator_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "blu_creator_map_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blu_creator_map_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blu_creator_map_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_promolog_eligible_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      blu_session: {
        Row: {
          id: number
          refreshed_at: string
          token: string
        }
        Insert: {
          id?: number
          refreshed_at?: string
          token: string
        }
        Update: {
          id?: number
          refreshed_at?: string
          token?: string
        }
        Relationships: []
      }
      blu_sync_requests: {
        Row: {
          finished_at: string | null
          id: number
          note: string | null
          requested_at: string
          requested_by: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          finished_at?: string | null
          id?: never
          note?: string | null
          requested_at?: string
          requested_by?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          finished_at?: string | null
          id?: never
          note?: string | null
          requested_at?: string
          requested_by?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      call_participants: {
        Row: {
          call_id: string
          id: string
          joined_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          call_id: string
          id?: string
          joined_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          call_id?: string
          id?: string
          joined_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_participants_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          call_status: string
          call_type: string
          caller_id: string
          conversation_id: string | null
          created_at: string
          end_time: string | null
          id: string
          is_group: boolean
          receiver_id: string | null
          room_id: string
          start_time: string | null
        }
        Insert: {
          call_status?: string
          call_type?: string
          caller_id: string
          conversation_id?: string | null
          created_at?: string
          end_time?: string | null
          id?: string
          is_group?: boolean
          receiver_id?: string | null
          room_id: string
          start_time?: string | null
        }
        Update: {
          call_status?: string
          call_type?: string
          caller_id?: string
          conversation_id?: string | null
          created_at?: string
          end_time?: string | null
          id?: string
          is_group?: boolean
          receiver_id?: string | null
          room_id?: string
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_archived: {
        Row: {
          conversation_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_archived_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string | null
          type: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          file_name: string | null
          file_size: number | null
          file_url: string | null
          id: string
          is_deleted: boolean
          is_edited: boolean
          reply_to_id: string | null
          sender_id: string
          type: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_deleted?: boolean
          is_edited?: boolean
          reply_to_id?: string | null
          sender_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_deleted?: boolean
          is_edited?: boolean
          reply_to_id?: string | null
          sender_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_participants: {
        Row: {
          conversation_id: string
          id: string
          is_muted: boolean
          joined_at: string
          last_read_at: string | null
          notifications_mode: string
          role: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          is_muted?: boolean
          joined_at?: string
          last_read_at?: string | null
          notifications_mode?: string
          role?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          is_muted?: boolean
          joined_at?: string
          last_read_at?: string | null
          notifications_mode?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_pinned: {
        Row: {
          conversation_id: string
          id: string
          pinned_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          pinned_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          pinned_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_pinned_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_read_receipts: {
        Row: {
          delivered_at: string | null
          id: string
          message_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          delivered_at?: string | null
          id?: string
          message_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          delivered_at?: string | null
          id?: string
          message_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_read_receipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_space_conversations: {
        Row: {
          added_at: string | null
          conversation_id: string
          id: string
          sort_order: number | null
          space_id: string
        }
        Insert: {
          added_at?: string | null
          conversation_id: string
          id?: string
          sort_order?: number | null
          space_id: string
        }
        Update: {
          added_at?: string | null
          conversation_id?: string
          id?: string
          sort_order?: number | null
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_space_conversations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_space_conversations_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "chat_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_spaces: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string
          icon: string | null
          id: string
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by: string
          icon?: string | null
          id?: string
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      chatter_config: {
        Row: {
          examiner_emojis: string[]
          fan_avatar_url: string
          fan_avatar_url_light: string | null
          fan_name: string
          id: number
          notification_emails: string[]
          notify_user_ids: string[]
          updated_at: string
        }
        Insert: {
          examiner_emojis?: string[]
          fan_avatar_url?: string
          fan_avatar_url_light?: string | null
          fan_name?: string
          id?: number
          notification_emails?: string[]
          notify_user_ids?: string[]
          updated_at?: string
        }
        Update: {
          examiner_emojis?: string[]
          fan_avatar_url?: string
          fan_avatar_url_light?: string | null
          fan_name?: string
          id?: number
          notification_emails?: string[]
          notify_user_ids?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      chatter_conversations: {
        Row: {
          body: string | null
          chat_id: number
          fan_name: string | null
          fan_username: string | null
          from_me: boolean | null
          id: string
          ingested_at: string
          is_free: boolean | null
          is_opened: boolean | null
          is_tip: boolean | null
          media_count: number | null
          message_id: number
          model_id: number
          model_name: string | null
          price: number | null
          sent_at: string | null
          sent_by_chatter_id: number | null
          sent_by_chatter_name: string | null
          tip_amount: number | null
        }
        Insert: {
          body?: string | null
          chat_id: number
          fan_name?: string | null
          fan_username?: string | null
          from_me?: boolean | null
          id?: string
          ingested_at?: string
          is_free?: boolean | null
          is_opened?: boolean | null
          is_tip?: boolean | null
          media_count?: number | null
          message_id: number
          model_id: number
          model_name?: string | null
          price?: number | null
          sent_at?: string | null
          sent_by_chatter_id?: number | null
          sent_by_chatter_name?: string | null
          tip_amount?: number | null
        }
        Update: {
          body?: string | null
          chat_id?: number
          fan_name?: string | null
          fan_username?: string | null
          from_me?: boolean | null
          id?: string
          ingested_at?: string
          is_free?: boolean | null
          is_opened?: boolean | null
          is_tip?: boolean | null
          media_count?: number | null
          message_id?: number
          model_id?: number
          model_name?: string | null
          price?: number | null
          sent_at?: string | null
          sent_by_chatter_id?: number | null
          sent_by_chatter_name?: string | null
          tip_amount?: number | null
        }
        Relationships: []
      }
      chatter_cost_config: {
        Row: {
          base_salary_cop: number
          effective_agency_rate: number
          fx_cop_per_usd: number
          fx_updated_at: string | null
          id: boolean
          of_net_factor: number
          rate_updated_at: string | null
          updated_at: string
        }
        Insert: {
          base_salary_cop?: number
          effective_agency_rate?: number
          fx_cop_per_usd?: number
          fx_updated_at?: string | null
          id?: boolean
          of_net_factor?: number
          rate_updated_at?: string | null
          updated_at?: string
        }
        Update: {
          base_salary_cop?: number
          effective_agency_rate?: number
          fx_cop_per_usd?: number
          fx_updated_at?: string | null
          id?: boolean
          of_net_factor?: number
          rate_updated_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      chatter_criteria_defaults: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          label_en: string | null
          position: number
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          label_en?: string | null
          position?: number
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          label_en?: string | null
          position?: number
          weight?: number
        }
        Relationships: []
      }
      chatter_daily_sales: {
        Row: {
          blu_employee_id: number
          date: string
          fans_chatted: number | null
          name: string | null
          sold_messages: number | null
          total_sales: number
          updated_at: string
        }
        Insert: {
          blu_employee_id: number
          date: string
          fans_chatted?: number | null
          name?: string | null
          sold_messages?: number | null
          total_sales?: number
          updated_at?: string
        }
        Update: {
          blu_employee_id?: number
          date?: string
          fans_chatted?: number | null
          name?: string | null
          sold_messages?: number | null
          total_sales?: number
          updated_at?: string
        }
        Relationships: []
      }
      chatter_evaluations: {
        Row: {
          created_at: string
          criteria_results: Json
          examiner_name: string | null
          examiner_user_id: string
          feedback: string | null
          id: string
          score_pct: number | null
          sent_at: string | null
          sent_to_apps_script: boolean
          session_id: string
          verdict: string
        }
        Insert: {
          created_at?: string
          criteria_results?: Json
          examiner_name?: string | null
          examiner_user_id: string
          feedback?: string | null
          id?: string
          score_pct?: number | null
          sent_at?: string | null
          sent_to_apps_script?: boolean
          session_id: string
          verdict: string
        }
        Update: {
          created_at?: string
          criteria_results?: Json
          examiner_name?: string | null
          examiner_user_id?: string
          feedback?: string | null
          id?: string
          score_pct?: number | null
          sent_at?: string | null
          sent_to_apps_script?: boolean
          session_id?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatter_evaluations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "chatter_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chatter_messages: {
        Row: {
          content: string | null
          content_history: Json
          created_at: string
          deleted: string | null
          edited_at: string | null
          examiner_user_id: string | null
          from_examiner: boolean
          id: string
          images: string[]
          msg_type: string
          price: number | null
          purchased: boolean
          reactions: Json
          reply_to_id: string | null
          role: string
          session_id: string
        }
        Insert: {
          content?: string | null
          content_history?: Json
          created_at?: string
          deleted?: string | null
          edited_at?: string | null
          examiner_user_id?: string | null
          from_examiner?: boolean
          id?: string
          images?: string[]
          msg_type?: string
          price?: number | null
          purchased?: boolean
          reactions?: Json
          reply_to_id?: string | null
          role: string
          session_id: string
        }
        Update: {
          content?: string | null
          content_history?: Json
          created_at?: string
          deleted?: string | null
          edited_at?: string | null
          examiner_user_id?: string | null
          from_examiner?: boolean
          id?: string
          images?: string[]
          msg_type?: string
          price?: number | null
          purchased?: boolean
          reactions?: Json
          reply_to_id?: string | null
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatter_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chatter_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatter_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chatter_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chatter_performance: {
        Row: {
          avg_earnings_per_paying_fan: number | null
          avg_response_seconds: number | null
          blu_employee_id: number
          characters_sent: number | null
          clocked_hours: number | null
          creators_count: number | null
          delta_total_sales: number | null
          deltas: Json | null
          direct_messages: number
          email: string | null
          fan_conversion_rate: number | null
          fans_chatted: number
          fans_spent_money: number
          fans_who_didnt_spend: number
          group_name: string | null
          id: string
          imported_at: string
          is_chatter: boolean | null
          metrics: Json | null
          name: string | null
          scheduled_hours: number | null
          snapshot_from: string | null
          snapshot_to: string | null
          sold_messages: number
          tenant_id: string
          total_sales: number
          unlock_rate: number | null
        }
        Insert: {
          avg_earnings_per_paying_fan?: number | null
          avg_response_seconds?: number | null
          blu_employee_id: number
          characters_sent?: number | null
          clocked_hours?: number | null
          creators_count?: number | null
          delta_total_sales?: number | null
          deltas?: Json | null
          direct_messages?: number
          email?: string | null
          fan_conversion_rate?: number | null
          fans_chatted?: number
          fans_spent_money?: number
          fans_who_didnt_spend?: number
          group_name?: string | null
          id?: string
          imported_at?: string
          is_chatter?: boolean | null
          metrics?: Json | null
          name?: string | null
          scheduled_hours?: number | null
          snapshot_from?: string | null
          snapshot_to?: string | null
          sold_messages?: number
          tenant_id?: string
          total_sales?: number
          unlock_rate?: number | null
        }
        Update: {
          avg_earnings_per_paying_fan?: number | null
          avg_response_seconds?: number | null
          blu_employee_id?: number
          characters_sent?: number | null
          clocked_hours?: number | null
          creators_count?: number | null
          delta_total_sales?: number | null
          deltas?: Json | null
          direct_messages?: number
          email?: string | null
          fan_conversion_rate?: number | null
          fans_chatted?: number
          fans_spent_money?: number
          fans_who_didnt_spend?: number
          group_name?: string | null
          id?: string
          imported_at?: string
          is_chatter?: boolean | null
          metrics?: Json | null
          name?: string | null
          scheduled_hours?: number | null
          snapshot_from?: string | null
          snapshot_to?: string | null
          sold_messages?: number
          tenant_id?: string
          total_sales?: number
          unlock_rate?: number | null
        }
        Relationships: []
      }
      chatter_profiles: {
        Row: {
          age: string | null
          age_en: string | null
          anal: string | null
          anal_en: string | null
          avatar_url: string | null
          avatar_x: number | null
          avatar_y: number | null
          avatar_zoom: number | null
          body: string | null
          body_en: string | null
          collabs: string | null
          collabs_en: string | null
          created_at: string
          custom: string | null
          custom_en: string | null
          extra: string | null
          extra_en: string | null
          extra_fields: Json
          greeting: string | null
          greeting_en: string | null
          id: string
          key: string
          location: string | null
          location_en: string | null
          name: string
          name_en: string | null
          nationality: string | null
          nationality_en: string | null
          nudity: string | null
          nudity_en: string | null
          prices: Json
          updated_at: string
          users_term: string | null
          users_term_en: string | null
          videocall: string | null
          videocall_en: string | null
        }
        Insert: {
          age?: string | null
          age_en?: string | null
          anal?: string | null
          anal_en?: string | null
          avatar_url?: string | null
          avatar_x?: number | null
          avatar_y?: number | null
          avatar_zoom?: number | null
          body?: string | null
          body_en?: string | null
          collabs?: string | null
          collabs_en?: string | null
          created_at?: string
          custom?: string | null
          custom_en?: string | null
          extra?: string | null
          extra_en?: string | null
          extra_fields?: Json
          greeting?: string | null
          greeting_en?: string | null
          id?: string
          key: string
          location?: string | null
          location_en?: string | null
          name: string
          name_en?: string | null
          nationality?: string | null
          nationality_en?: string | null
          nudity?: string | null
          nudity_en?: string | null
          prices?: Json
          updated_at?: string
          users_term?: string | null
          users_term_en?: string | null
          videocall?: string | null
          videocall_en?: string | null
        }
        Update: {
          age?: string | null
          age_en?: string | null
          anal?: string | null
          anal_en?: string | null
          avatar_url?: string | null
          avatar_x?: number | null
          avatar_y?: number | null
          avatar_zoom?: number | null
          body?: string | null
          body_en?: string | null
          collabs?: string | null
          collabs_en?: string | null
          created_at?: string
          custom?: string | null
          custom_en?: string | null
          extra?: string | null
          extra_en?: string | null
          extra_fields?: Json
          greeting?: string | null
          greeting_en?: string | null
          id?: string
          key?: string
          location?: string | null
          location_en?: string | null
          name?: string
          name_en?: string | null
          nationality?: string | null
          nationality_en?: string | null
          nudity?: string | null
          nudity_en?: string | null
          prices?: Json
          updated_at?: string
          users_term?: string | null
          users_term_en?: string | null
          videocall?: string | null
          videocall_en?: string | null
        }
        Relationships: []
      }
      chatter_qa_config: {
        Row: {
          id: number
          notification_emails: string[]
          notify_on_analyzed: boolean
          notify_on_failed: boolean
          notify_on_low_score: boolean
          notify_user_ids: string[]
          updated_at: string
        }
        Insert: {
          id?: number
          notification_emails?: string[]
          notify_on_analyzed?: boolean
          notify_on_failed?: boolean
          notify_on_low_score?: boolean
          notify_user_ids?: string[]
          updated_at?: string
        }
        Update: {
          id?: number
          notification_emails?: string[]
          notify_on_analyzed?: boolean
          notify_on_failed?: boolean
          notify_on_low_score?: boolean
          notify_user_ids?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      chatter_qa_reports: {
        Row: {
          blu_employee_id: number | null
          chatter_name: string
          company: string
          created_at: string
          created_by: string | null
          email_sent_at: string | null
          error_message: string | null
          evaluated_models: Json
          evaluator_name: string
          id: string
          period: string
          report: Json
          sampling: Json
          source: string
          status: string
          updated_at: string
          veredicto: string | null
        }
        Insert: {
          blu_employee_id?: number | null
          chatter_name: string
          company: string
          created_at?: string
          created_by?: string | null
          email_sent_at?: string | null
          error_message?: string | null
          evaluated_models?: Json
          evaluator_name?: string
          id?: string
          period: string
          report?: Json
          sampling?: Json
          source?: string
          status?: string
          updated_at?: string
          veredicto?: string | null
        }
        Update: {
          blu_employee_id?: number | null
          chatter_name?: string
          company?: string
          created_at?: string
          created_by?: string | null
          email_sent_at?: string | null
          error_message?: string | null
          evaluated_models?: Json
          evaluator_name?: string
          id?: string
          period?: string
          report?: Json
          sampling?: Json
          source?: string
          status?: string
          updated_at?: string
          veredicto?: string | null
        }
        Relationships: []
      }
      chatter_qa_section_feedback: {
        Row: {
          created_at: string
          evaluator_name: string | null
          id: string
          note: string | null
          report_id: string
          section_index: number
          section_label: string | null
          section_type: string
          thumbs: number
        }
        Insert: {
          created_at?: string
          evaluator_name?: string | null
          id?: string
          note?: string | null
          report_id: string
          section_index: number
          section_label?: string | null
          section_type: string
          thumbs: number
        }
        Update: {
          created_at?: string
          evaluator_name?: string | null
          id?: string
          note?: string | null
          report_id?: string
          section_index?: number
          section_label?: string | null
          section_type?: string
          thumbs?: number
        }
        Relationships: [
          {
            foreignKeyName: "chatter_qa_section_feedback_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "chatter_qa_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      chatter_scorecards: {
        Row: {
          blu_employee_id: number | null
          c1_puntualidad: number | null
          c2_calidad_chats: number | null
          c3_cumplimiento_meta: number | null
          c4_productividad_hubstaff: number | null
          c5_actitud_disciplina: number | null
          c6_gestion_estrategia: number | null
          c7_scripts: number | null
          c8_camara_pantalla: number | null
          chatter_name: string
          company: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          period: string
          source: string
          total: number | null
          updated_at: string
        }
        Insert: {
          blu_employee_id?: number | null
          c1_puntualidad?: number | null
          c2_calidad_chats?: number | null
          c3_cumplimiento_meta?: number | null
          c4_productividad_hubstaff?: number | null
          c5_actitud_disciplina?: number | null
          c6_gestion_estrategia?: number | null
          c7_scripts?: number | null
          c8_camara_pantalla?: number | null
          chatter_name: string
          company: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          period: string
          source?: string
          total?: number | null
          updated_at?: string
        }
        Update: {
          blu_employee_id?: number | null
          c1_puntualidad?: number | null
          c2_calidad_chats?: number | null
          c3_cumplimiento_meta?: number | null
          c4_productividad_hubstaff?: number | null
          c5_actitud_disciplina?: number | null
          c6_gestion_estrategia?: number | null
          c7_scripts?: number | null
          c8_camara_pantalla?: number | null
          chatter_name?: string
          company?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          period?: string
          source?: string
          total?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      chatter_scripts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          send_on_click: boolean
          sort_order: number
          surface: string
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          send_on_click?: boolean
          sort_order?: number
          surface?: string
          text: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          send_on_click?: boolean
          sort_order?: number
          surface?: string
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chatter_sessions: {
        Row: {
          active_device_claimed_at: string | null
          active_device_id: string | null
          chatter_name: string
          created_at: string
          created_by: string | null
          duration_minutes: number
          ended_at: string | null
          examiner_name: string | null
          examiner_user_id: string
          expires_at: string | null
          id: string
          profile_id: string
          read_by_chatter_at: string | null
          read_by_examiner_at: string | null
          started_at: string | null
          status: string
          typing_chatter: boolean
          typing_chatter_at: string | null
          typing_fan: boolean
          typing_fan_at: string | null
        }
        Insert: {
          active_device_claimed_at?: string | null
          active_device_id?: string | null
          chatter_name: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          ended_at?: string | null
          examiner_name?: string | null
          examiner_user_id: string
          expires_at?: string | null
          id: string
          profile_id: string
          read_by_chatter_at?: string | null
          read_by_examiner_at?: string | null
          started_at?: string | null
          status?: string
          typing_chatter?: boolean
          typing_chatter_at?: string | null
          typing_fan?: boolean
          typing_fan_at?: string | null
        }
        Update: {
          active_device_claimed_at?: string | null
          active_device_id?: string | null
          chatter_name?: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          ended_at?: string | null
          examiner_name?: string | null
          examiner_user_id?: string
          expires_at?: string | null
          id?: string
          profile_id?: string
          read_by_chatter_at?: string | null
          read_by_examiner_at?: string | null
          started_at?: string | null
          status?: string
          typing_chatter?: boolean
          typing_chatter_at?: string | null
          typing_fan?: boolean
          typing_fan_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chatter_sessions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "chatter_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chatter_vault_items: {
        Row: {
          created_at: string
          id: string
          media_type: string | null
          name: string
          position: number
          profile_id: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          media_type?: string | null
          name: string
          position?: number
          profile_id: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          media_type?: string | null
          name?: string
          position?: number
          profile_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatter_vault_items_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "chatter_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      closer_contact_history: {
        Row: {
          channel: string
          contact_date: string
          created_at: string
          created_by: string | null
          creator_id: string
          id: string
          notes: string | null
          result: string | null
        }
        Insert: {
          channel: string
          contact_date?: string
          created_at?: string
          created_by?: string | null
          creator_id: string
          id?: string
          notes?: string | null
          result?: string | null
        }
        Update: {
          channel?: string
          contact_date?: string
          created_at?: string
          created_by?: string | null
          creator_id?: string
          id?: string
          notes?: string | null
          result?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "closer_contact_history_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "closer_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      closer_creators: {
        Row: {
          agency_commission: number | null
          assigned_to: string | null
          category: string | null
          city: string | null
          close_reason_code: string | null
          company_id: string | null
          completed_date: string | null
          confirmed_date: string | null
          created_at: string
          created_by: string | null
          deal_type: string
          estimated_monetization: number | null
          extras: number | null
          id: string
          instagram_handle: string
          last_contact_date: string | null
          lead_meta: Json | null
          lead_source: string
          leadgen_entry_id: string | null
          main_platform: string | null
          model_id: string | null
          monthly_monetization: number | null
          no_interesada_date: string | null
          notes: string | null
          onlyfans_url: string | null
          passed_date: string | null
          phone: string | null
          phone_first_set_at: string | null
          rejection_reason: string | null
          source_account: string | null
          source_contact_id: string | null
          stage: string
          subscription_amount: number | null
          updated_at: string
        }
        Insert: {
          agency_commission?: number | null
          assigned_to?: string | null
          category?: string | null
          city?: string | null
          close_reason_code?: string | null
          company_id?: string | null
          completed_date?: string | null
          confirmed_date?: string | null
          created_at?: string
          created_by?: string | null
          deal_type?: string
          estimated_monetization?: number | null
          extras?: number | null
          id?: string
          instagram_handle: string
          last_contact_date?: string | null
          lead_meta?: Json | null
          lead_source?: string
          leadgen_entry_id?: string | null
          main_platform?: string | null
          model_id?: string | null
          monthly_monetization?: number | null
          no_interesada_date?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          passed_date?: string | null
          phone?: string | null
          phone_first_set_at?: string | null
          rejection_reason?: string | null
          source_account?: string | null
          source_contact_id?: string | null
          stage?: string
          subscription_amount?: number | null
          updated_at?: string
        }
        Update: {
          agency_commission?: number | null
          assigned_to?: string | null
          category?: string | null
          city?: string | null
          close_reason_code?: string | null
          company_id?: string | null
          completed_date?: string | null
          confirmed_date?: string | null
          created_at?: string
          created_by?: string | null
          deal_type?: string
          estimated_monetization?: number | null
          extras?: number | null
          id?: string
          instagram_handle?: string
          last_contact_date?: string | null
          lead_meta?: Json | null
          lead_source?: string
          leadgen_entry_id?: string | null
          main_platform?: string | null
          model_id?: string | null
          monthly_monetization?: number | null
          no_interesada_date?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          passed_date?: string | null
          phone?: string | null
          phone_first_set_at?: string | null
          rejection_reason?: string | null
          source_account?: string | null
          source_contact_id?: string | null
          stage?: string
          subscription_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "closer_creators_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closer_creators_leadgen_entry_id_fkey"
            columns: ["leadgen_entry_id"]
            isOneToOne: false
            referencedRelation: "leadgen_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closer_creators_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closer_creators_source_contact_id_fkey"
            columns: ["source_contact_id"]
            isOneToOne: false
            referencedRelation: "closers_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closer_creators_source_contact_id_fkey"
            columns: ["source_contact_id"]
            isOneToOne: false
            referencedRelation: "v_closers_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      closer_creators_backup_agencias_20260801: {
        Row: {
          agency_commission: number | null
          assigned_to: string | null
          category: string | null
          city: string | null
          close_reason_code: string | null
          company_id: string | null
          completed_date: string | null
          confirmed_date: string | null
          created_at: string | null
          created_by: string | null
          deal_type: string | null
          estimated_monetization: number | null
          extras: number | null
          id: string | null
          instagram_handle: string | null
          last_contact_date: string | null
          lead_meta: Json | null
          lead_source: string | null
          leadgen_entry_id: string | null
          main_platform: string | null
          model_id: string | null
          monthly_monetization: number | null
          no_interesada_date: string | null
          notes: string | null
          onlyfans_url: string | null
          passed_date: string | null
          phone: string | null
          phone_first_set_at: string | null
          rejection_reason: string | null
          source_account: string | null
          source_contact_id: string | null
          stage: string | null
          subscription_amount: number | null
          updated_at: string | null
        }
        Insert: {
          agency_commission?: number | null
          assigned_to?: string | null
          category?: string | null
          city?: string | null
          close_reason_code?: string | null
          company_id?: string | null
          completed_date?: string | null
          confirmed_date?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_type?: string | null
          estimated_monetization?: number | null
          extras?: number | null
          id?: string | null
          instagram_handle?: string | null
          last_contact_date?: string | null
          lead_meta?: Json | null
          lead_source?: string | null
          leadgen_entry_id?: string | null
          main_platform?: string | null
          model_id?: string | null
          monthly_monetization?: number | null
          no_interesada_date?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          passed_date?: string | null
          phone?: string | null
          phone_first_set_at?: string | null
          rejection_reason?: string | null
          source_account?: string | null
          source_contact_id?: string | null
          stage?: string | null
          subscription_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          agency_commission?: number | null
          assigned_to?: string | null
          category?: string | null
          city?: string | null
          close_reason_code?: string | null
          company_id?: string | null
          completed_date?: string | null
          confirmed_date?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_type?: string | null
          estimated_monetization?: number | null
          extras?: number | null
          id?: string | null
          instagram_handle?: string | null
          last_contact_date?: string | null
          lead_meta?: Json | null
          lead_source?: string | null
          leadgen_entry_id?: string | null
          main_platform?: string | null
          model_id?: string | null
          monthly_monetization?: number | null
          no_interesada_date?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          passed_date?: string | null
          phone?: string | null
          phone_first_set_at?: string | null
          rejection_reason?: string | null
          source_account?: string | null
          source_contact_id?: string | null
          stage?: string | null
          subscription_amount?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      closer_creators_backup_excreadoras_20260801: {
        Row: {
          agency_commission: number | null
          assigned_to: string | null
          category: string | null
          city: string | null
          close_reason_code: string | null
          company_id: string | null
          completed_date: string | null
          confirmed_date: string | null
          created_at: string | null
          created_by: string | null
          deal_type: string | null
          estimated_monetization: number | null
          extras: number | null
          id: string | null
          instagram_handle: string | null
          last_contact_date: string | null
          lead_meta: Json | null
          lead_source: string | null
          leadgen_entry_id: string | null
          main_platform: string | null
          model_id: string | null
          monthly_monetization: number | null
          no_interesada_date: string | null
          notes: string | null
          onlyfans_url: string | null
          passed_date: string | null
          phone: string | null
          phone_first_set_at: string | null
          rejection_reason: string | null
          source_account: string | null
          source_contact_id: string | null
          stage: string | null
          subscription_amount: number | null
          updated_at: string | null
        }
        Insert: {
          agency_commission?: number | null
          assigned_to?: string | null
          category?: string | null
          city?: string | null
          close_reason_code?: string | null
          company_id?: string | null
          completed_date?: string | null
          confirmed_date?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_type?: string | null
          estimated_monetization?: number | null
          extras?: number | null
          id?: string | null
          instagram_handle?: string | null
          last_contact_date?: string | null
          lead_meta?: Json | null
          lead_source?: string | null
          leadgen_entry_id?: string | null
          main_platform?: string | null
          model_id?: string | null
          monthly_monetization?: number | null
          no_interesada_date?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          passed_date?: string | null
          phone?: string | null
          phone_first_set_at?: string | null
          rejection_reason?: string | null
          source_account?: string | null
          source_contact_id?: string | null
          stage?: string | null
          subscription_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          agency_commission?: number | null
          assigned_to?: string | null
          category?: string | null
          city?: string | null
          close_reason_code?: string | null
          company_id?: string | null
          completed_date?: string | null
          confirmed_date?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_type?: string | null
          estimated_monetization?: number | null
          extras?: number | null
          id?: string | null
          instagram_handle?: string | null
          last_contact_date?: string | null
          lead_meta?: Json | null
          lead_source?: string | null
          leadgen_entry_id?: string | null
          main_platform?: string | null
          model_id?: string | null
          monthly_monetization?: number | null
          no_interesada_date?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          passed_date?: string | null
          phone?: string | null
          phone_first_set_at?: string | null
          rejection_reason?: string | null
          source_account?: string | null
          source_contact_id?: string | null
          stage?: string | null
          subscription_amount?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      closer_creators_backup_yacreadoras_20260803: {
        Row: {
          agency_commission: number | null
          assigned_to: string | null
          category: string | null
          city: string | null
          close_reason_code: string | null
          company_id: string | null
          completed_date: string | null
          confirmed_date: string | null
          created_at: string | null
          created_by: string | null
          deal_type: string | null
          estimated_monetization: number | null
          extras: number | null
          id: string | null
          instagram_handle: string | null
          last_contact_date: string | null
          lead_meta: Json | null
          lead_source: string | null
          leadgen_entry_id: string | null
          main_platform: string | null
          model_id: string | null
          monthly_monetization: number | null
          no_interesada_date: string | null
          notes: string | null
          onlyfans_url: string | null
          passed_date: string | null
          phone: string | null
          phone_first_set_at: string | null
          rejection_reason: string | null
          source_account: string | null
          source_contact_id: string | null
          stage: string | null
          subscription_amount: number | null
          updated_at: string | null
        }
        Insert: {
          agency_commission?: number | null
          assigned_to?: string | null
          category?: string | null
          city?: string | null
          close_reason_code?: string | null
          company_id?: string | null
          completed_date?: string | null
          confirmed_date?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_type?: string | null
          estimated_monetization?: number | null
          extras?: number | null
          id?: string | null
          instagram_handle?: string | null
          last_contact_date?: string | null
          lead_meta?: Json | null
          lead_source?: string | null
          leadgen_entry_id?: string | null
          main_platform?: string | null
          model_id?: string | null
          monthly_monetization?: number | null
          no_interesada_date?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          passed_date?: string | null
          phone?: string | null
          phone_first_set_at?: string | null
          rejection_reason?: string | null
          source_account?: string | null
          source_contact_id?: string | null
          stage?: string | null
          subscription_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          agency_commission?: number | null
          assigned_to?: string | null
          category?: string | null
          city?: string | null
          close_reason_code?: string | null
          company_id?: string | null
          completed_date?: string | null
          confirmed_date?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_type?: string | null
          estimated_monetization?: number | null
          extras?: number | null
          id?: string | null
          instagram_handle?: string | null
          last_contact_date?: string | null
          lead_meta?: Json | null
          lead_source?: string | null
          leadgen_entry_id?: string | null
          main_platform?: string | null
          model_id?: string | null
          monthly_monetization?: number | null
          no_interesada_date?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          passed_date?: string | null
          phone?: string | null
          phone_first_set_at?: string | null
          rejection_reason?: string | null
          source_account?: string | null
          source_contact_id?: string | null
          stage?: string | null
          subscription_amount?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      closer_platform_sales: {
        Row: {
          created_at: string | null
          created_by: string | null
          creator_id: string
          id: string
          platform: string
          price: number | null
          product: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          creator_id: string
          id?: string
          platform: string
          price?: number | null
          product?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          creator_id?: string
          id?: string
          platform?: string
          price?: number | null
          product?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "closer_platform_sales_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "closer_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      closers_contacts: {
        Row: {
          assigned_to: string | null
          city: string | null
          company: string | null
          company_id: string | null
          contact_kind: string
          country_code: string | null
          created_at: string | null
          created_by: string
          email: string | null
          handle: string
          id: string
          leadgen_entry_id: string | null
          media_files: Json | null
          model_id: string | null
          name: string
          notes: string | null
          onlyfans_url: string | null
          phone: string | null
          phone_first_set_at: string | null
          physical_appearance: string | null
          platform: string
          profile_picture_url: string | null
          record_type: string
          source: string | null
          status: string | null
          ticket_number: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          city?: string | null
          company?: string | null
          company_id?: string | null
          contact_kind?: string
          country_code?: string | null
          created_at?: string | null
          created_by: string
          email?: string | null
          handle: string
          id?: string
          leadgen_entry_id?: string | null
          media_files?: Json | null
          model_id?: string | null
          name: string
          notes?: string | null
          onlyfans_url?: string | null
          phone?: string | null
          phone_first_set_at?: string | null
          physical_appearance?: string | null
          platform: string
          profile_picture_url?: string | null
          record_type?: string
          source?: string | null
          status?: string | null
          ticket_number?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          city?: string | null
          company?: string | null
          company_id?: string | null
          contact_kind?: string
          country_code?: string | null
          created_at?: string | null
          created_by?: string
          email?: string | null
          handle?: string
          id?: string
          leadgen_entry_id?: string | null
          media_files?: Json | null
          model_id?: string | null
          name?: string
          notes?: string | null
          onlyfans_url?: string | null
          phone?: string | null
          phone_first_set_at?: string | null
          physical_appearance?: string | null
          platform?: string
          profile_picture_url?: string | null
          record_type?: string
          source?: string | null
          status?: string | null
          ticket_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "closers_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "scouter_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closers_contacts_leadgen_entry_id_fkey"
            columns: ["leadgen_entry_id"]
            isOneToOne: false
            referencedRelation: "leadgen_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closers_contacts_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      closers_contacts_evidence_files: {
        Row: {
          contact_id: string
          file_type: string | null
          file_url: string
          id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          contact_id: string
          file_type?: string | null
          file_url: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          contact_id?: string
          file_type?: string | null
          file_url?: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "closers_contacts_evidence_files_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "closers_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closers_contacts_evidence_files_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_closers_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      cloudphone_assignments: {
        Row: {
          assigned_by: string | null
          assigned_to: string
          created_at: string
          profile_id: string
          remark: string | null
          serial_name: string | null
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          assigned_to: string
          created_at?: string
          profile_id: string
          remark?: string | null
          serial_name?: string | null
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          assigned_to?: string
          created_at?: string
          profile_id?: string
          remark?: string | null
          serial_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cloudphone_sessions: {
        Row: {
          created_at: string
          end_reason: string | null
          ended_at: string | null
          id: string
          profile_id: string
          serial_name: string | null
          started_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          profile_id: string
          serial_name?: string | null
          started_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          profile_id?: string
          serial_name?: string | null
          started_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      commissions: {
        Row: {
          area: string | null
          base_amount: number | null
          calculation_config: Json
          calculation_method: string
          commission_type: string
          cost_center: string | null
          created_at: string
          created_by: string | null
          creator_id: string | null
          employee_id: string | null
          estimated_amount: number | null
          final_amount: number | null
          id: string
          notes: string | null
          payment_date: string | null
          payment_method: string | null
          percentage: number | null
          period: string
          period_end: string | null
          period_name: string | null
          period_start: string | null
          status: string
          updated_at: string
        }
        Insert: {
          area?: string | null
          base_amount?: number | null
          calculation_config?: Json
          calculation_method?: string
          commission_type?: string
          cost_center?: string | null
          created_at?: string
          created_by?: string | null
          creator_id?: string | null
          employee_id?: string | null
          estimated_amount?: number | null
          final_amount?: number | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          percentage?: number | null
          period: string
          period_end?: string | null
          period_name?: string | null
          period_start?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          area?: string | null
          base_amount?: number | null
          calculation_config?: Json
          calculation_method?: string
          commission_type?: string
          cost_center?: string | null
          created_at?: string
          created_by?: string | null
          creator_id?: string | null
          employee_id?: string | null
          estimated_amount?: number | null
          final_amount?: number | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          percentage?: number | null
          period?: string
          period_end?: string | null
          period_name?: string | null
          period_start?: string | null
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
            foreignKeyName: "commissions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_promolog_eligible_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
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
      contact_category_changes: {
        Row: {
          changed_at: string
          changed_by: string
          contact_created_at: string | null
          contact_handle: string
          contact_id: string
          contact_name: string
          hours_since_creation: number | null
          id: string
          new_category: string | null
          old_category: string | null
        }
        Insert: {
          changed_at?: string
          changed_by: string
          contact_created_at?: string | null
          contact_handle: string
          contact_id: string
          contact_name: string
          hours_since_creation?: number | null
          id?: string
          new_category?: string | null
          old_category?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          contact_created_at?: string | null
          contact_handle?: string
          contact_id?: string
          contact_name?: string
          hours_since_creation?: number | null
          id?: string
          new_category?: string | null
          old_category?: string | null
        }
        Relationships: []
      }
      contact_interaction_files: {
        Row: {
          created_at: string | null
          file_name: string
          file_type: string
          file_url: string
          id: string
          interaction_id: string
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_type: string
          file_url: string
          id?: string
          interaction_id: string
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_type?: string
          file_url?: string
          id?: string
          interaction_id?: string
        }
        Relationships: []
      }
      contact_interactions: {
        Row: {
          call_number: number | null
          call_summary: string | null
          contact_id: string
          created_at: string | null
          id: string
          interaction_date: string | null
          interaction_type: string
          notes: string | null
          resulting_status: string | null
          user_id: string
        }
        Insert: {
          call_number?: number | null
          call_summary?: string | null
          contact_id: string
          created_at?: string | null
          id?: string
          interaction_date?: string | null
          interaction_type: string
          notes?: string | null
          resulting_status?: string | null
          user_id: string
        }
        Update: {
          call_number?: number | null
          call_summary?: string | null
          contact_id?: string
          created_at?: string | null
          id?: string
          interaction_date?: string | null
          interaction_type?: string
          notes?: string | null
          resulting_status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      contactos: {
        Row: {
          categoria_fisica: string | null
          city: string | null
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
          city?: string | null
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
          city?: string | null
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
      corte_claims: {
        Row: {
          created_at: string
          fecha: string
          group_id: string
          hora: number
        }
        Insert: {
          created_at?: string
          fecha: string
          group_id: string
          hora: number
        }
        Update: {
          created_at?: string
          fecha?: string
          group_id?: string
          hora?: number
        }
        Relationships: []
      }
      corte_notas: {
        Row: {
          componentes: Json
          created_at: string
          fecha: string
          group_id: string
          nombre: string
          nota_sugerida: number | null
          profile_id: string
        }
        Insert: {
          componentes?: Json
          created_at?: string
          fecha: string
          group_id: string
          nombre: string
          nota_sugerida?: number | null
          profile_id: string
        }
        Update: {
          componentes?: Json
          created_at?: string
          fecha?: string
          group_id?: string
          nombre?: string
          nota_sugerida?: number | null
          profile_id?: string
        }
        Relationships: []
      }
      cowork_host_requests: {
        Row: {
          acked_at: string | null
          acked_by: string | null
          created_at: string
          id: string
          message: string | null
          oneone_livekit_room: string | null
          resolved_at: string | null
          resolved_by: string | null
          room_id: string
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          acked_at?: string | null
          acked_by?: string | null
          created_at?: string
          id?: string
          message?: string | null
          oneone_livekit_room?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          room_id: string
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          acked_at?: string | null
          acked_by?: string | null
          created_at?: string
          id?: string
          message?: string | null
          oneone_livekit_room?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          room_id?: string
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cowork_host_requests_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "cowork_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cowork_host_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cowork_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cowork_memberships: {
        Row: {
          id: string
          joined_at: string
          role: string
          session_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          role?: string
          session_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          role?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cowork_memberships_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cowork_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cowork_room_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          is_active: boolean
          room_id: string
          session_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          is_active?: boolean
          room_id: string
          session_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          is_active?: boolean
          room_id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cowork_room_assignments_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "cowork_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cowork_room_assignments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cowork_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cowork_rooms: {
        Row: {
          created_at: string
          id: string
          join_code: string
          livekit_room_name: string
          name: string
          preview_mode: string
          session_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          join_code: string
          livekit_room_name: string
          name: string
          preview_mode?: string
          session_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          join_code?: string
          livekit_room_name?: string
          name?: string
          preview_mode?: string
          session_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "cowork_rooms_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cowork_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cowork_screenshare_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          expires_at: string | null
          id: string
          room_id: string
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string | null
          id?: string
          room_id: string
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string | null
          id?: string
          room_id?: string
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cowork_screenshare_requests_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "cowork_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cowork_screenshare_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cowork_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cowork_sessions: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          ended_at: string | null
          host_hub_livekit_room: string
          host_invite_code: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          ended_at?: string | null
          host_hub_livekit_room: string
          host_invite_code?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          ended_at?: string | null
          host_hub_livekit_room?: string
          host_invite_code?: string
          id?: string
          name?: string
          status?: string
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
      creator_blu_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          creator_id: string
          id: string
          new_state: boolean
          tenant_id: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          creator_id: string
          id?: string
          new_state: boolean
          tenant_id?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          creator_id?: string
          id?: string
          new_state?: boolean
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_blu_history_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_blu_history_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_blu_history_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_promolog_eligible_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_business: {
        Row: {
          agency_percentage: number | null
          assigned_agency: string | null
          assigned_manager_id: string | null
          assigned_manager_profile_id: string | null
          assigned_specialist_id: string | null
          assigned_specialist_profile_id: string | null
          billing_address: string | null
          billing_frequency: string | null
          billing_start_date: string | null
          blue_package: boolean | null
          closer_responsible_id: string | null
          closer_responsible_profile_id: string | null
          commission_tiers: Json | null
          commission_type: string | null
          company_id: string | null
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
          billing_address?: string | null
          billing_frequency?: string | null
          billing_start_date?: string | null
          blue_package?: boolean | null
          closer_responsible_id?: string | null
          closer_responsible_profile_id?: string | null
          commission_tiers?: Json | null
          commission_type?: string | null
          company_id?: string | null
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
          billing_address?: string | null
          billing_frequency?: string | null
          billing_start_date?: string | null
          blue_package?: boolean | null
          closer_responsible_id?: string | null
          closer_responsible_profile_id?: string | null
          commission_tiers?: Json | null
          commission_type?: string | null
          company_id?: string | null
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
            foreignKeyName: "creator_business_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "scouter_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_business_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_business_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_business_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "v_promolog_eligible_creators"
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
          {
            foreignKeyName: "creator_chatter_assignments_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_chatter_assignments_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_promolog_eligible_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_daily_earnings: {
        Row: {
          active_fans: number | null
          blu_creator_name: string
          chargebacks_gross: number
          contribution_pct: number | null
          creator_id: string | null
          date: string
          id: string
          imported_at: string
          imported_by: string | null
          message_gross: number
          new_fans: number | null
          new_sub_gross: number
          post_gross: number
          recurring_sub_gross: number
          referral_gross: number
          source: string
          stream_gross: number
          subscription_gross: number
          tenant_id: string
          tips_gross: number
          total_gross: number
        }
        Insert: {
          active_fans?: number | null
          blu_creator_name: string
          chargebacks_gross?: number
          contribution_pct?: number | null
          creator_id?: string | null
          date: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          message_gross?: number
          new_fans?: number | null
          new_sub_gross?: number
          post_gross?: number
          recurring_sub_gross?: number
          referral_gross?: number
          source?: string
          stream_gross?: number
          subscription_gross?: number
          tenant_id?: string
          tips_gross?: number
          total_gross?: number
        }
        Update: {
          active_fans?: number | null
          blu_creator_name?: string
          chargebacks_gross?: number
          contribution_pct?: number | null
          creator_id?: string | null
          date?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          message_gross?: number
          new_fans?: number | null
          new_sub_gross?: number
          post_gross?: number
          recurring_sub_gross?: number
          referral_gross?: number
          source?: string
          stream_gross?: number
          subscription_gross?: number
          tenant_id?: string
          tips_gross?: number
          total_gross?: number
        }
        Relationships: [
          {
            foreignKeyName: "creator_daily_earnings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_daily_earnings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_daily_earnings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_promolog_eligible_creators"
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
      creator_fan_retention: {
        Row: {
          after_days: Json | null
          blu_model_id: number
          blu_name: string
          cohort_date: string
          creator_id: string | null
          id: string
          imported_at: string
          new_fans: number
          observed_days: number
          snapshot_from: string | null
          snapshot_to: string | null
          tenant_id: string
        }
        Insert: {
          after_days?: Json | null
          blu_model_id: number
          blu_name: string
          cohort_date: string
          creator_id?: string | null
          id?: string
          imported_at?: string
          new_fans?: number
          observed_days?: number
          snapshot_from?: string | null
          snapshot_to?: string | null
          tenant_id?: string
        }
        Update: {
          after_days?: Json | null
          blu_model_id?: number
          blu_name?: string
          cohort_date?: string
          creator_id?: string | null
          id?: string
          imported_at?: string
          new_fans?: number
          observed_days?: number
          snapshot_from?: string | null
          snapshot_to?: string | null
          tenant_id?: string
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
      creator_milestones: {
        Row: {
          amount_usd: number | null
          created_at: string
          creator_handle: string | null
          creator_id: string | null
          detail: string | null
          id: string
          kind: string
          occurred_on: string
          product: string | null
          reported_by: string | null
          reported_by_user_id: string | null
          source_group_id: string | null
          source_message_id: string | null
          tenant_id: string
          title: string
          verificado: boolean
        }
        Insert: {
          amount_usd?: number | null
          created_at?: string
          creator_handle?: string | null
          creator_id?: string | null
          detail?: string | null
          id?: string
          kind: string
          occurred_on: string
          product?: string | null
          reported_by?: string | null
          reported_by_user_id?: string | null
          source_group_id?: string | null
          source_message_id?: string | null
          tenant_id: string
          title: string
          verificado?: boolean
        }
        Update: {
          amount_usd?: number | null
          created_at?: string
          creator_handle?: string | null
          creator_id?: string | null
          detail?: string | null
          id?: string
          kind?: string
          occurred_on?: string
          product?: string | null
          reported_by?: string | null
          reported_by_user_id?: string | null
          source_group_id?: string | null
          source_message_id?: string | null
          tenant_id?: string
          title?: string
          verificado?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "creator_milestones_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_milestones_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_milestones_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_promolog_eligible_creators"
            referencedColumns: ["id"]
          },
        ]
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
      creator_of_accounts: {
        Row: {
          account_handle: string
          created_at: string
          creator_id: string
          id: string
          onlyfans_url: string | null
        }
        Insert: {
          account_handle: string
          created_at?: string
          creator_id: string
          id?: string
          onlyfans_url?: string | null
        }
        Update: {
          account_handle?: string
          created_at?: string
          creator_id?: string
          id?: string
          onlyfans_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_of_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_of_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_of_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_promolog_eligible_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_offboarding_approvals: {
        Row: {
          approved: boolean | null
          approved_at: string | null
          approver_id: string
          created_at: string | null
          id: string
          offboarding_id: string
        }
        Insert: {
          approved?: boolean | null
          approved_at?: string | null
          approver_id: string
          created_at?: string | null
          id?: string
          offboarding_id: string
        }
        Update: {
          approved?: boolean | null
          approved_at?: string | null
          approver_id?: string
          created_at?: string | null
          id?: string
          offboarding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_offboarding_approvals_offboarding_id_fkey"
            columns: ["offboarding_id"]
            isOneToOne: false
            referencedRelation: "creator_offboardings"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_offboardings: {
        Row: {
          avg_monthly_revenue: number | null
          categoria: string | null
          check_accesos: boolean | null
          check_campanas: boolean | null
          check_documentacion: boolean | null
          check_material: boolean | null
          check_pagos: boolean | null
          comentarios: string | null
          comunicado_generado: string | null
          created_at: string | null
          created_by: string | null
          creator_id: string
          estimated_lost_revenue: number | null
          exit_date: string | null
          id: string
          last_revenue: number | null
          motivo_comercial: string | null
          motivo_final: string | null
          motivo_operativo: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          avg_monthly_revenue?: number | null
          categoria?: string | null
          check_accesos?: boolean | null
          check_campanas?: boolean | null
          check_documentacion?: boolean | null
          check_material?: boolean | null
          check_pagos?: boolean | null
          comentarios?: string | null
          comunicado_generado?: string | null
          created_at?: string | null
          created_by?: string | null
          creator_id: string
          estimated_lost_revenue?: number | null
          exit_date?: string | null
          id?: string
          last_revenue?: number | null
          motivo_comercial?: string | null
          motivo_final?: string | null
          motivo_operativo?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          avg_monthly_revenue?: number | null
          categoria?: string | null
          check_accesos?: boolean | null
          check_campanas?: boolean | null
          check_documentacion?: boolean | null
          check_material?: boolean | null
          check_pagos?: boolean | null
          comentarios?: string | null
          comunicado_generado?: string | null
          created_at?: string | null
          created_by?: string | null
          creator_id?: string
          estimated_lost_revenue?: number | null
          exit_date?: string | null
          id?: string
          last_revenue?: number | null
          motivo_comercial?: string | null
          motivo_final?: string | null
          motivo_operativo?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_offboardings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_offboardings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_offboardings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_promolog_eligible_creators"
            referencedColumns: ["id"]
          },
        ]
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
      creator_social_accounts: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          creator_id: string
          id: string
          network: string
          updated_at: string
          username: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          creator_id: string
          id?: string
          network?: string
          updated_at?: string
          username: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          creator_id?: string
          id?: string
          network?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_social_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_social_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_social_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_promolog_eligible_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          creator_id: string
          id: string
          instagram_handle: string | null
          name: string | null
          new_status: string
          old_status: string | null
          snapshot: Json | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          creator_id: string
          id?: string
          instagram_handle?: string | null
          name?: string | null
          new_status: string
          old_status?: string | null
          snapshot?: Json | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          creator_id?: string
          id?: string
          instagram_handle?: string | null
          name?: string | null
          new_status?: string
          old_status?: string | null
          snapshot?: Json | null
        }
        Relationships: []
      }
      creator_top_fans: {
        Row: {
          blu_model_id: number
          blu_name: string
          creator_id: string | null
          expires_at: string | null
          fan_name: string | null
          fan_user_id: number
          fan_username: string | null
          id: string
          imported_at: string
          is_active: boolean | null
          messages_gross: number
          period_kind: string
          ppv_gross: number
          rank: number | null
          snapshot_from: string | null
          snapshot_to: string | null
          spent_gross: number
          subscribed_at: string | null
          subscription_length_days: number | null
          subscriptions_gross: number
          tenant_id: string
          tips_gross: number
          transactions: number
        }
        Insert: {
          blu_model_id: number
          blu_name: string
          creator_id?: string | null
          expires_at?: string | null
          fan_name?: string | null
          fan_user_id: number
          fan_username?: string | null
          id?: string
          imported_at?: string
          is_active?: boolean | null
          messages_gross?: number
          period_kind?: string
          ppv_gross?: number
          rank?: number | null
          snapshot_from?: string | null
          snapshot_to?: string | null
          spent_gross?: number
          subscribed_at?: string | null
          subscription_length_days?: number | null
          subscriptions_gross?: number
          tenant_id?: string
          tips_gross?: number
          transactions?: number
        }
        Update: {
          blu_model_id?: number
          blu_name?: string
          creator_id?: string | null
          expires_at?: string | null
          fan_name?: string | null
          fan_user_id?: number
          fan_username?: string | null
          id?: string
          imported_at?: string
          is_active?: boolean | null
          messages_gross?: number
          period_kind?: string
          ppv_gross?: number
          rank?: number | null
          snapshot_from?: string | null
          snapshot_to?: string | null
          spent_gross?: number
          subscribed_at?: string | null
          subscription_length_days?: number | null
          subscriptions_gross?: number
          tenant_id?: string
          tips_gross?: number
          transactions?: number
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
          blu_infloww_active: boolean
          category: string | null
          category_code: string | null
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
          created_by: string | null
          currency: string | null
          deporte_equipo: string | null
          dia_perfecto: string | null
          direccion: string | null
          edad_mostrar: number | null
          email: string | null
          emoji_frecuente: string | null
          entered_crm_at: string | null
          entered_crm_by: string | null
          entered_crm_notes: string | null
          estado_civil: string | null
          estatura: string | null
          estrategia_material_gratis: string | null
          estrategia_problemas_personales: string | null
          estrategia_rechazo: string | null
          estrategia_recuperacion: string | null
          etnicidad: string | null
          external_transfer: number | null
          facebook_handle: string | null
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
          model_id: string | null
          musica_artistas: string | null
          name: string
          nivel_estudios: string | null
          nivel_lectura: string | null
          notes: string | null
          onlyfans_url: string | null
          orientacion_perfil: string | null
          other_url: string | null
          otras_plataformas: string | null
          palabras_prohibidas: string | null
          peliculas_tv: string | null
          permiso_edad_real: boolean | null
          permiso_nombre_real: boolean | null
          permiso_ubicacion: boolean | null
          personalidad_marca: string | null
          phone: string | null
          phone_e164: string | null
          phone_first_set_at: string | null
          piclink_url: string | null
          plataforma_videollamada: string | null
          precios_contenido: Json | null
          profile_photo_url: string | null
          promo_target_networks: string[] | null
          que_buscas_pareja: string | null
          que_haces_relajarte: string | null
          que_te_hace_reir: string | null
          que_te_incomoda: string | null
          que_te_motiva_crear: string | null
          reddit_handle: string | null
          redes_sociales: string | null
          registration_date: string | null
          rejoined_at: string | null
          rejoined_from: string | null
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
          telegram_handle: string | null
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
          blu_infloww_active?: boolean
          category?: string | null
          category_code?: string | null
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
          created_by?: string | null
          currency?: string | null
          deporte_equipo?: string | null
          dia_perfecto?: string | null
          direccion?: string | null
          edad_mostrar?: number | null
          email?: string | null
          emoji_frecuente?: string | null
          entered_crm_at?: string | null
          entered_crm_by?: string | null
          entered_crm_notes?: string | null
          estado_civil?: string | null
          estatura?: string | null
          estrategia_material_gratis?: string | null
          estrategia_problemas_personales?: string | null
          estrategia_rechazo?: string | null
          estrategia_recuperacion?: string | null
          etnicidad?: string | null
          external_transfer?: number | null
          facebook_handle?: string | null
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
          model_id?: string | null
          musica_artistas?: string | null
          name: string
          nivel_estudios?: string | null
          nivel_lectura?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          orientacion_perfil?: string | null
          other_url?: string | null
          otras_plataformas?: string | null
          palabras_prohibidas?: string | null
          peliculas_tv?: string | null
          permiso_edad_real?: boolean | null
          permiso_nombre_real?: boolean | null
          permiso_ubicacion?: boolean | null
          personalidad_marca?: string | null
          phone?: string | null
          phone_e164?: string | null
          phone_first_set_at?: string | null
          piclink_url?: string | null
          plataforma_videollamada?: string | null
          precios_contenido?: Json | null
          profile_photo_url?: string | null
          promo_target_networks?: string[] | null
          que_buscas_pareja?: string | null
          que_haces_relajarte?: string | null
          que_te_hace_reir?: string | null
          que_te_incomoda?: string | null
          que_te_motiva_crear?: string | null
          reddit_handle?: string | null
          redes_sociales?: string | null
          registration_date?: string | null
          rejoined_at?: string | null
          rejoined_from?: string | null
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
          telegram_handle?: string | null
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
          blu_infloww_active?: boolean
          category?: string | null
          category_code?: string | null
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
          created_by?: string | null
          currency?: string | null
          deporte_equipo?: string | null
          dia_perfecto?: string | null
          direccion?: string | null
          edad_mostrar?: number | null
          email?: string | null
          emoji_frecuente?: string | null
          entered_crm_at?: string | null
          entered_crm_by?: string | null
          entered_crm_notes?: string | null
          estado_civil?: string | null
          estatura?: string | null
          estrategia_material_gratis?: string | null
          estrategia_problemas_personales?: string | null
          estrategia_rechazo?: string | null
          estrategia_recuperacion?: string | null
          etnicidad?: string | null
          external_transfer?: number | null
          facebook_handle?: string | null
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
          model_id?: string | null
          musica_artistas?: string | null
          name?: string
          nivel_estudios?: string | null
          nivel_lectura?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          orientacion_perfil?: string | null
          other_url?: string | null
          otras_plataformas?: string | null
          palabras_prohibidas?: string | null
          peliculas_tv?: string | null
          permiso_edad_real?: boolean | null
          permiso_nombre_real?: boolean | null
          permiso_ubicacion?: boolean | null
          personalidad_marca?: string | null
          phone?: string | null
          phone_e164?: string | null
          phone_first_set_at?: string | null
          piclink_url?: string | null
          plataforma_videollamada?: string | null
          precios_contenido?: Json | null
          profile_photo_url?: string | null
          promo_target_networks?: string[] | null
          que_buscas_pareja?: string | null
          que_haces_relajarte?: string | null
          que_te_hace_reir?: string | null
          que_te_incomoda?: string | null
          que_te_motiva_crear?: string | null
          reddit_handle?: string | null
          redes_sociales?: string | null
          registration_date?: string | null
          rejoined_at?: string | null
          rejoined_from?: string | null
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
          telegram_handle?: string | null
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
        Relationships: [
          {
            foreignKeyName: "creators_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "model_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "creators_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_content_requests: {
        Row: {
          assigned_chatter_id: string | null
          attachment_url: string | null
          category: string
          completed_at: string | null
          content_type: string
          created_at: string
          creator_id: string | null
          description: string | null
          due_date: string | null
          fan_spent_amount: number | null
          fan_username: string | null
          id: string
          notes: string | null
          paid_amount: number | null
          priority: string
          quantity_or_duration: string | null
          request_date: string | null
          requested_by: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_chatter_id?: string | null
          attachment_url?: string | null
          category?: string
          completed_at?: string | null
          content_type?: string
          created_at?: string
          creator_id?: string | null
          description?: string | null
          due_date?: string | null
          fan_spent_amount?: number | null
          fan_username?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number | null
          priority?: string
          quantity_or_duration?: string | null
          request_date?: string | null
          requested_by?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_chatter_id?: string | null
          attachment_url?: string | null
          category?: string
          completed_at?: string | null
          content_type?: string
          created_at?: string
          creator_id?: string | null
          description?: string | null
          due_date?: string | null
          fan_spent_amount?: number | null
          fan_username?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number | null
          priority?: string
          quantity_or_duration?: string | null
          request_date?: string | null
          requested_by?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_content_requests_assigned_chatter_id_fkey"
            columns: ["assigned_chatter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_content_requests_assigned_chatter_id_fkey"
            columns: ["assigned_chatter_id"]
            isOneToOne: false
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "custom_content_requests_assigned_chatter_id_fkey"
            columns: ["assigned_chatter_id"]
            isOneToOne: false
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "custom_content_requests_assigned_chatter_id_fkey"
            columns: ["assigned_chatter_id"]
            isOneToOne: false
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "custom_content_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_content_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_content_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_promolog_eligible_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_content_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_content_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "custom_content_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "custom_content_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
        ]
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
          {
            foreignKeyName: "employee_deductions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
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
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
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
          {
            foreignKeyName: "employee_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
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
          {
            foreignKeyName: "employee_incidents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
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
          {
            foreignKeyName: "employee_offboarding_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_offboarding_tasks: {
        Row: {
          category: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          offboarding_id: string
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
          offboarding_id: string
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
          offboarding_id?: string
          position?: number
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_offboarding_tasks_offboarding_id_fkey"
            columns: ["offboarding_id"]
            isOneToOne: false
            referencedRelation: "employee_offboarding"
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
            foreignKeyName: "employee_onboarding_buddy_employee_id_fkey"
            columns: ["buddy_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_onboarding_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_onboarding_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees_directory"
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
            foreignKeyName: "employee_training_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
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
          bank_notes: string | null
          base_salary: number | null
          birth_date: string | null
          caja_compensacion: string | null
          city: string | null
          company_id: string | null
          contract_type: string | null
          cost_center: string | null
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
          has_commission: boolean | null
          hire_date: string | null
          hour_bank_enabled: boolean | null
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
          bank_notes?: string | null
          base_salary?: number | null
          birth_date?: string | null
          caja_compensacion?: string | null
          city?: string | null
          company_id?: string | null
          contract_type?: string | null
          cost_center?: string | null
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
          has_commission?: boolean | null
          hire_date?: string | null
          hour_bank_enabled?: boolean | null
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
          bank_notes?: string | null
          base_salary?: number | null
          birth_date?: string | null
          caja_compensacion?: string | null
          city?: string | null
          company_id?: string | null
          contract_type?: string | null
          cost_center?: string | null
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
          has_commission?: boolean | null
          hire_date?: string | null
          hour_bank_enabled?: boolean | null
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
            foreignKeyName: "employees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "employees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "employees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "employees_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "employees_directory"
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
            foreignKeyName: "event_guests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_guests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_promolog_eligible_creators"
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
          video_call_room_id: string | null
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
          video_call_room_id?: string | null
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
          video_call_room_id?: string | null
        }
        Relationships: []
      }
      financial_config: {
        Row: {
          category: string
          config_key: string
          config_value: Json
          created_at: string
          description: string | null
          id: string
          updated_at: string
        }
        Insert: {
          category?: string
          config_key: string
          config_value?: Json
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          category?: string
          config_key?: string
          config_value?: Json
          created_at?: string
          description?: string | null
          id?: string
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
          {
            foreignKeyName: "hour_bank_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_role_cost: {
        Row: {
          base_salary_cop: number
          role: string
          updated_at: string
        }
        Insert: {
          base_salary_cop?: number
          role: string
          updated_at?: string
        }
        Update: {
          base_salary_cop?: number
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      hubstaff_activities: {
        Row: {
          id: string
          keyboard_activity: number | null
          keyboard_events: number | null
          member_id: string
          mouse_activity: number | null
          mouse_events: number | null
          overall_activity: number | null
          project_name: string | null
          starts_at: string
          task_name: string | null
          tracked_seconds: number
        }
        Insert: {
          id?: string
          keyboard_activity?: number | null
          keyboard_events?: number | null
          member_id: string
          mouse_activity?: number | null
          mouse_events?: number | null
          overall_activity?: number | null
          project_name?: string | null
          starts_at: string
          task_name?: string | null
          tracked_seconds?: number
        }
        Update: {
          id?: string
          keyboard_activity?: number | null
          keyboard_events?: number | null
          member_id?: string
          mouse_activity?: number | null
          mouse_events?: number | null
          overall_activity?: number | null
          project_name?: string | null
          starts_at?: string
          task_name?: string | null
          tracked_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "hubstaff_activities_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "hubstaff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      hubstaff_config: {
        Row: {
          api_token_set: boolean
          created_at: string
          id: string
          last_sync_at: string | null
          org_id: string | null
          sync_enabled: boolean
          sync_interval_minutes: number
          updated_at: string
        }
        Insert: {
          api_token_set?: boolean
          created_at?: string
          id?: string
          last_sync_at?: string | null
          org_id?: string | null
          sync_enabled?: boolean
          sync_interval_minutes?: number
          updated_at?: string
        }
        Update: {
          api_token_set?: boolean
          created_at?: string
          id?: string
          last_sync_at?: string | null
          org_id?: string | null
          sync_enabled?: boolean
          sync_interval_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      hubstaff_daily_data: {
        Row: {
          date: string
          first_activity_at: string | null
          hubstaff_org_id: string | null
          hubstaff_user_id: string
          id: string
          overall_activity: number | null
          project_name: string | null
          tracked_seconds: number
          updated_at: string
        }
        Insert: {
          date: string
          first_activity_at?: string | null
          hubstaff_org_id?: string | null
          hubstaff_user_id: string
          id?: string
          overall_activity?: number | null
          project_name?: string | null
          tracked_seconds?: number
          updated_at?: string
        }
        Update: {
          date?: string
          first_activity_at?: string | null
          hubstaff_org_id?: string | null
          hubstaff_user_id?: string
          id?: string
          overall_activity?: number | null
          project_name?: string | null
          tracked_seconds?: number
          updated_at?: string
        }
        Relationships: []
      }
      hubstaff_members: {
        Row: {
          created_at: string
          email: string | null
          hubstaff_org_id: string | null
          hubstaff_role: string | null
          hubstaff_user_id: string | null
          id: string
          is_active: boolean
          last_seen_at: string | null
          name: string | null
          profile_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          hubstaff_org_id?: string | null
          hubstaff_role?: string | null
          hubstaff_user_id?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          name?: string | null
          profile_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          hubstaff_org_id?: string | null
          hubstaff_role?: string | null
          hubstaff_user_id?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          name?: string | null
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hubstaff_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hubstaff_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "hubstaff_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "hubstaff_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      hubstaff_screenshots: {
        Row: {
          activity_percent: number | null
          captured_at: string
          id: string
          member_id: string
          screenshot_url: string
        }
        Insert: {
          activity_percent?: number | null
          captured_at: string
          id?: string
          member_id: string
          screenshot_url: string
        }
        Update: {
          activity_percent?: number | null
          captured_at?: string
          id?: string
          member_id?: string
          screenshot_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "hubstaff_screenshots_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "hubstaff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      hubstaff_secrets: {
        Row: {
          access_expires_at: string | null
          access_token: string | null
          id: number
          refresh_token: string | null
          updated_at: string
        }
        Insert: {
          access_expires_at?: string | null
          access_token?: string | null
          id?: number
          refresh_token?: string | null
          updated_at?: string
        }
        Update: {
          access_expires_at?: string | null
          access_token?: string | null
          id?: number
          refresh_token?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hubstaff_sync_requests: {
        Row: {
          finished_at: string | null
          id: number
          note: string | null
          requested_at: string
          requested_by: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          finished_at?: string | null
          id?: never
          note?: string | null
          requested_at?: string
          requested_by?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          finished_at?: string | null
          id?: never
          note?: string | null
          requested_at?: string
          requested_by?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      internal_announcements: {
        Row: {
          announcement_type: string
          attachment_name: string | null
          attachment_url: string | null
          content_html: string | null
          created_at: string
          created_by: string
          delivery_channels: string[]
          expires_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          message: string | null
          open_count: number
          priority: string
          recurrence_end_at: string | null
          recurrence_type: string
          related_module: string | null
          starts_at: string
          status: string
          title: string
          updated_at: string
          view_count: number
          visibility: string
        }
        Insert: {
          announcement_type?: string
          attachment_name?: string | null
          attachment_url?: string | null
          content_html?: string | null
          created_at?: string
          created_by: string
          delivery_channels?: string[]
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          message?: string | null
          open_count?: number
          priority?: string
          recurrence_end_at?: string | null
          recurrence_type?: string
          related_module?: string | null
          starts_at?: string
          status?: string
          title: string
          updated_at?: string
          view_count?: number
          visibility?: string
        }
        Update: {
          announcement_type?: string
          attachment_name?: string | null
          attachment_url?: string | null
          content_html?: string | null
          created_at?: string
          created_by?: string
          delivery_channels?: string[]
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          message?: string | null
          open_count?: number
          priority?: string
          recurrence_end_at?: string | null
          recurrence_type?: string
          related_module?: string | null
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
          view_count?: number
          visibility?: string
        }
        Relationships: []
      }
      invoice_templates: {
        Row: {
          company_address: string | null
          company_email: string | null
          company_name: string | null
          company_zip: string | null
          created_at: string | null
          created_by: string | null
          id: string
          logo_url: string | null
          name: string
          type: string
          updated_at: string | null
        }
        Insert: {
          company_address?: string | null
          company_email?: string | null
          company_name?: string | null
          company_zip?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          logo_url?: string | null
          name: string
          type?: string
          updated_at?: string | null
        }
        Update: {
          company_address?: string | null
          company_email?: string | null
          company_name?: string | null
          company_zip?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          agency_amount: number | null
          amount: number
          blue_amount: number | null
          commission_snapshot: Json | null
          created_at: string
          created_by: string | null
          creator_id: string | null
          due_date: string | null
          evidence_url: string | null
          fee_amount: number | null
          fee_type: string | null
          id: string
          invoice_number: string
          net_amount: number | null
          notes: string | null
          paid_date: string | null
          payment_method: string | null
          paypal_amount: number | null
          period_end: string | null
          period_start: string | null
          reversal_reason: string | null
          status: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          agency_amount?: number | null
          amount?: number
          blue_amount?: number | null
          commission_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          creator_id?: string | null
          due_date?: string | null
          evidence_url?: string | null
          fee_amount?: number | null
          fee_type?: string | null
          id?: string
          invoice_number?: string
          net_amount?: number | null
          notes?: string | null
          paid_date?: string | null
          payment_method?: string | null
          paypal_amount?: number | null
          period_end?: string | null
          period_start?: string | null
          reversal_reason?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          agency_amount?: number | null
          amount?: number
          blue_amount?: number | null
          commission_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          creator_id?: string | null
          due_date?: string | null
          evidence_url?: string | null
          fee_amount?: number | null
          fee_type?: string | null
          id?: string
          invoice_number?: string
          net_amount?: number | null
          notes?: string | null
          paid_date?: string | null
          payment_method?: string | null
          paypal_amount?: number | null
          period_end?: string | null
          period_start?: string | null
          reversal_reason?: string | null
          status?: string
          template_id?: string | null
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
          {
            foreignKeyName: "invoices_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_promolog_eligible_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "invoice_templates"
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
      leadgen_alerts: {
        Row: {
          created_at: string | null
          entry_id: string | null
          id: string
          lg_user_id: string
          link: string | null
          message: string
          read_at: string | null
          severity: string
        }
        Insert: {
          created_at?: string | null
          entry_id?: string | null
          id?: string
          lg_user_id: string
          link?: string | null
          message: string
          read_at?: string | null
          severity: string
        }
        Update: {
          created_at?: string | null
          entry_id?: string | null
          id?: string
          lg_user_id?: string
          link?: string | null
          message?: string
          read_at?: string | null
          severity?: string
        }
        Relationships: []
      }
      leadgen_entries: {
        Row: {
          category_code: string | null
          city: string | null
          company: string | null
          company_id: string | null
          country_code: string | null
          created_at: string | null
          created_creator_id: string | null
          entry_date: string
          id: string
          lg_user_id: string | null
          model_handle: string
          model_id: string | null
          notes: string | null
          onlyfans_url: string | null
          phone_e164: string | null
          phone_first_set_at: string | null
          phone_raw: string | null
          platform: string
          quality: string
          record_type: string
          source_link: string | null
          state: string | null
          status: string | null
          tenant_id: string
          ticket_number: string | null
          updated_at: string | null
        }
        Insert: {
          category_code?: string | null
          city?: string | null
          company?: string | null
          company_id?: string | null
          country_code?: string | null
          created_at?: string | null
          created_creator_id?: string | null
          entry_date?: string
          id?: string
          lg_user_id?: string | null
          model_handle: string
          model_id?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          phone_e164?: string | null
          phone_first_set_at?: string | null
          phone_raw?: string | null
          platform: string
          quality?: string
          record_type?: string
          source_link?: string | null
          state?: string | null
          status?: string | null
          tenant_id?: string
          ticket_number?: string | null
          updated_at?: string | null
        }
        Update: {
          category_code?: string | null
          city?: string | null
          company?: string | null
          company_id?: string | null
          country_code?: string | null
          created_at?: string | null
          created_creator_id?: string | null
          entry_date?: string
          id?: string
          lg_user_id?: string | null
          model_handle?: string
          model_id?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          phone_e164?: string | null
          phone_first_set_at?: string | null
          phone_raw?: string | null
          platform?: string
          quality?: string
          record_type?: string
          source_link?: string | null
          state?: string | null
          status?: string | null
          tenant_id?: string
          ticket_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leadgen_entries_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "model_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "leadgen_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "scouter_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leadgen_entries_created_creator_id_fkey"
            columns: ["created_creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leadgen_entries_created_creator_id_fkey"
            columns: ["created_creator_id"]
            isOneToOne: false
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leadgen_entries_created_creator_id_fkey"
            columns: ["created_creator_id"]
            isOneToOne: false
            referencedRelation: "v_promolog_eligible_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leadgen_entries_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leadgen_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leadgen_evidence_files: {
        Row: {
          file_type: string
          file_url: string
          id: string
          leadgen_entry_id: string
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          file_type: string
          file_url: string
          id?: string
          leadgen_entry_id: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          file_type?: string
          file_url?: string
          id?: string
          leadgen_entry_id?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      leadgen_files: {
        Row: {
          created_at: string | null
          entry_id: string
          file_type: string
          file_url: string
          id: string
        }
        Insert: {
          created_at?: string | null
          entry_id: string
          file_type: string
          file_url: string
          id?: string
        }
        Update: {
          created_at?: string | null
          entry_id?: string
          file_type?: string
          file_url?: string
          id?: string
        }
        Relationships: []
      }
      leadgen_note_files: {
        Row: {
          created_at: string | null
          file_name: string
          file_type: string
          file_url: string
          id: string
          note_id: string
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_type: string
          file_url: string
          id?: string
          note_id: string
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_type?: string
          file_url?: string
          id?: string
          note_id?: string
        }
        Relationships: []
      }
      leadgen_notes: {
        Row: {
          created_at: string | null
          entry_id: string
          id: string
          note_text: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          entry_id: string
          id?: string
          note_text: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          entry_id?: string
          id?: string
          note_text?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      leadgen_qa: {
        Row: {
          comment: string | null
          created_at: string | null
          entry_id: string | null
          id: string
          rating: string | null
          score: string | null
          supervisor_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          entry_id?: string | null
          id?: string
          rating?: string | null
          score?: string | null
          supervisor_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          entry_id?: string | null
          id?: string
          rating?: string | null
          score?: string | null
          supervisor_id?: string | null
        }
        Relationships: []
      }
      leadgen_qa_feedback: {
        Row: {
          category: string
          created_at: string | null
          entry_id: string
          feedback: string
          id: string
          lg_user_id: string
          rating: string
          reviewer_id: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          entry_id: string
          feedback: string
          id?: string
          lg_user_id: string
          rating: string
          reviewer_id: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          entry_id?: string
          feedback?: string
          id?: string
          lg_user_id?: string
          rating?: string
          reviewer_id?: string
          updated_at?: string | null
        }
        Relationships: []
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
      mail_connections: {
        Row: {
          connected_at: string
          email_address: string
          id: string
          last_error: string | null
          last_used_at: string | null
          provider: string
          refresh_token: string
          revoked_at: string | null
          scopes: string | null
          user_id: string
          zoho_account_id: string | null
        }
        Insert: {
          connected_at?: string
          email_address: string
          id?: string
          last_error?: string | null
          last_used_at?: string | null
          provider?: string
          refresh_token: string
          revoked_at?: string | null
          scopes?: string | null
          user_id: string
          zoho_account_id?: string | null
        }
        Update: {
          connected_at?: string
          email_address?: string
          id?: string
          last_error?: string | null
          last_used_at?: string | null
          provider?: string
          refresh_token?: string
          revoked_at?: string | null
          scopes?: string | null
          user_id?: string
          zoho_account_id?: string | null
        }
        Relationships: []
      }
      meet_guest_attempts: {
        Row: {
          created_at: string
          id: number
          ip_hash: string
          ok: boolean
        }
        Insert: {
          created_at?: string
          id?: number
          ip_hash: string
          ok?: boolean
        }
        Update: {
          created_at?: string
          id?: number
          ip_hash?: string
          ok?: boolean
        }
        Relationships: []
      }
      meet_guest_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          guest_name: string
          guest_token: string
          id: string
          ip_hash: string | null
          meet_room_id: string
          status: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          guest_name: string
          guest_token: string
          id?: string
          ip_hash?: string | null
          meet_room_id: string
          status?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          guest_name?: string
          guest_token?: string
          id?: string
          ip_hash?: string | null
          meet_room_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "meet_guest_requests_meet_room_id_fkey"
            columns: ["meet_room_id"]
            isOneToOne: false
            referencedRelation: "meet_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      meet_rooms: {
        Row: {
          code: string
          created_at: string
          created_by: string
          ended_at: string | null
          id: string
          livekit_room_name: string
          name: string
          status: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          ended_at?: string | null
          id?: string
          livekit_room_name: string
          name: string
          status?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          ended_at?: string | null
          id?: string
          livekit_room_name?: string
          name?: string
          status?: string
        }
        Relationships: []
      }
      missing_creatos_id_of_gross_earnings: {
        Row: {
          created_at: string
          Creator: string | null
          id: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          Creator?: string | null
          id?: number
          tenant_id?: string
        }
        Update: {
          created_at?: string
          Creator?: string | null
          id?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "missing_creatos_id_of_gross_earnings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      model_categories: {
        Row: {
          active: boolean
          code: string
          created_at: string
          label: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          label: string
          sort_order: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      model_phones: {
        Row: {
          captured_at: string
          captured_by: string | null
          created_at: string
          id: string
          is_primary: boolean
          model_id: string
          phone_e164: string
          phone_raw: string | null
          source_module: string
          status: string
          tenant_id: string
        }
        Insert: {
          captured_at?: string
          captured_by?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          model_id: string
          phone_e164: string
          phone_raw?: string | null
          source_module: string
          status?: string
          tenant_id?: string
        }
        Update: {
          captured_at?: string
          captured_by?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          model_id?: string
          phone_e164?: string
          phone_raw?: string | null
          source_module?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_phones_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_phones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      models: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          display_name: string | null
          followers_count: number | null
          id: string
          instagram_handle: string | null
          is_verified: boolean | null
          last_scraped_at: string | null
          onlyfans_url: string | null
          posts_count: number | null
          state: string | null
          tenant_id: string
          tiktok_handle: string | null
          twitter_handle: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          followers_count?: number | null
          id?: string
          instagram_handle?: string | null
          is_verified?: boolean | null
          last_scraped_at?: string | null
          onlyfans_url?: string | null
          posts_count?: number | null
          state?: string | null
          tenant_id?: string
          tiktok_handle?: string | null
          twitter_handle?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          followers_count?: number | null
          id?: string
          instagram_handle?: string | null
          is_verified?: boolean | null
          last_scraped_at?: string | null
          onlyfans_url?: string | null
          posts_count?: number | null
          state?: string | null
          tenant_id?: string
          tiktok_handle?: string | null
          twitter_handle?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "models_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      monetization_opportunities: {
        Row: {
          assigned_to: string | null
          closer_creator_id: string | null
          created_at: string
          created_by: string | null
          creator_handle: string
          id: string
          last_touch_at: string
          lost_reason: string | null
          monthly_value_usd: number | null
          next_followup_at: string | null
          notes: string | null
          product: string
          source: string
          stage: string
          tenant_id: string
          updated_at: string
          won_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          closer_creator_id?: string | null
          created_at?: string
          created_by?: string | null
          creator_handle: string
          id?: string
          last_touch_at?: string
          lost_reason?: string | null
          monthly_value_usd?: number | null
          next_followup_at?: string | null
          notes?: string | null
          product: string
          source?: string
          stage?: string
          tenant_id?: string
          updated_at?: string
          won_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          closer_creator_id?: string | null
          created_at?: string
          created_by?: string | null
          creator_handle?: string
          id?: string
          last_touch_at?: string
          lost_reason?: string | null
          monthly_value_usd?: number | null
          next_followup_at?: string | null
          notes?: string | null
          product?: string
          source?: string
          stage?: string
          tenant_id?: string
          updated_at?: string
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monetization_opportunities_closer_creator_id_fkey"
            columns: ["closer_creator_id"]
            isOneToOne: false
            referencedRelation: "closer_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      monetization_opportunities_backup_dupwon_20260803: {
        Row: {
          assigned_to: string | null
          closer_creator_id: string | null
          created_at: string | null
          created_by: string | null
          creator_handle: string | null
          id: string | null
          last_touch_at: string | null
          lost_reason: string | null
          monthly_value_usd: number | null
          next_followup_at: string | null
          notes: string | null
          product: string | null
          source: string | null
          stage: string | null
          tenant_id: string | null
          updated_at: string | null
          won_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          closer_creator_id?: string | null
          created_at?: string | null
          created_by?: string | null
          creator_handle?: string | null
          id?: string | null
          last_touch_at?: string | null
          lost_reason?: string | null
          monthly_value_usd?: number | null
          next_followup_at?: string | null
          notes?: string | null
          product?: string | null
          source?: string | null
          stage?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          won_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          closer_creator_id?: string | null
          created_at?: string | null
          created_by?: string | null
          creator_handle?: string | null
          id?: string | null
          last_touch_at?: string | null
          lost_reason?: string | null
          monthly_value_usd?: number | null
          next_followup_at?: string | null
          notes?: string | null
          product?: string | null
          source?: string | null
          stage?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          won_at?: string | null
        }
        Relationships: []
      }
      mp_candidate_checklist: {
        Row: {
          candidate_id: string
          completed: boolean
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          item_key: string
        }
        Insert: {
          candidate_id: string
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          item_key: string
        }
        Update: {
          candidate_id?: string
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          item_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "mp_candidate_checklist_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "mp_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_candidates: {
        Row: {
          city: string | null
          contact_date: string | null
          created_at: string
          created_by: string | null
          estimated_tier: string | null
          id: string
          name: string
          notes: string | null
          photo_url: string | null
          position: number
          stage: Database["public"]["Enums"]["mp_candidate_stage"]
          updated_at: string
        }
        Insert: {
          city?: string | null
          contact_date?: string | null
          created_at?: string
          created_by?: string | null
          estimated_tier?: string | null
          id?: string
          name: string
          notes?: string | null
          photo_url?: string | null
          position?: number
          stage?: Database["public"]["Enums"]["mp_candidate_stage"]
          updated_at?: string
        }
        Update: {
          city?: string | null
          contact_date?: string | null
          created_at?: string
          created_by?: string | null
          estimated_tier?: string | null
          id?: string
          name?: string
          notes?: string | null
          photo_url?: string | null
          position?: number
          stage?: Database["public"]["Enums"]["mp_candidate_stage"]
          updated_at?: string
        }
        Relationships: []
      }
      mp_content_entries: {
        Row: {
          content_type: Database["public"]["Enums"]["mp_content_type"]
          created_at: string
          created_by: string | null
          date: string
          id: string
          model_id: string
          notes: string | null
          quantity: number
          source: Database["public"]["Enums"]["mp_content_source"]
        }
        Insert: {
          content_type: Database["public"]["Enums"]["mp_content_type"]
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          model_id: string
          notes?: string | null
          quantity?: number
          source: Database["public"]["Enums"]["mp_content_source"]
        }
        Update: {
          content_type?: Database["public"]["Enums"]["mp_content_type"]
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          model_id?: string
          notes?: string | null
          quantity?: number
          source?: Database["public"]["Enums"]["mp_content_source"]
        }
        Relationships: [
          {
            foreignKeyName: "mp_content_entries_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "mp_models"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_content_sessions: {
        Row: {
          created_at: string
          id: string
          model_id: string
          notes: string | null
          scheduled_at: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          model_id: string
          notes?: string | null
          scheduled_at: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          model_id?: string
          notes?: string | null
          scheduled_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mp_content_sessions_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "mp_models"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_financials: {
        Row: {
          cost_chatters: number
          cost_content: number
          cost_other: number
          cost_traffic: number
          created_at: string
          id: string
          model_id: string
          month: string
          notes: string | null
          revenue: number
          updated_at: string
        }
        Insert: {
          cost_chatters?: number
          cost_content?: number
          cost_other?: number
          cost_traffic?: number
          created_at?: string
          id?: string
          model_id: string
          month: string
          notes?: string | null
          revenue?: number
          updated_at?: string
        }
        Update: {
          cost_chatters?: number
          cost_content?: number
          cost_other?: number
          cost_traffic?: number
          created_at?: string
          id?: string
          model_id?: string
          month?: string
          notes?: string | null
          revenue?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mp_financials_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "mp_models"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_milestones: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          phase_id: string | null
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          phase_id?: string | null
          position?: number
          title: string
          updated_at?: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          phase_id?: string | null
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mp_milestones_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "mp_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_models: {
        Row: {
          account_url: string | null
          candidate_id: string | null
          created_at: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          account_url?: string | null
          candidate_id?: string | null
          created_at?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_url?: string | null
          candidate_id?: string | null
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mp_models_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "mp_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_phases: {
        Row: {
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          name: string
          phase_number: number
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          phase_number: number
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          phase_number?: number
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      mp_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          phase_id: string | null
          pillar: Database["public"]["Enums"]["mp_task_pillar"]
          position: number
          priority: Database["public"]["Enums"]["mp_task_priority"]
          status: Database["public"]["Enums"]["mp_task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          phase_id?: string | null
          pillar?: Database["public"]["Enums"]["mp_task_pillar"]
          position?: number
          priority?: Database["public"]["Enums"]["mp_task_priority"]
          status?: Database["public"]["Enums"]["mp_task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          phase_id?: string | null
          pillar?: Database["public"]["Enums"]["mp_task_pillar"]
          position?: number
          priority?: Database["public"]["Enums"]["mp_task_priority"]
          status?: Database["public"]["Enums"]["mp_task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mp_tasks_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "mp_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_team_members: {
        Row: {
          accounts_assigned: string[] | null
          created_at: string
          id: string
          name: string
          role: string
          salary: number | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accounts_assigned?: string[] | null
          created_at?: string
          id?: string
          name: string
          role: string
          salary?: number | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          accounts_assigned?: string[] | null
          created_at?: string
          id?: string
          name?: string
          role?: string
          salary?: number | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      mp_team_plan: {
        Row: {
          created_at: string
          headcount_target: number
          id: string
          month_target: number
          notes: string | null
        }
        Insert: {
          created_at?: string
          headcount_target: number
          id?: string
          month_target: number
          notes?: string | null
        }
        Update: {
          created_at?: string
          headcount_target?: number
          id?: string
          month_target?: number
          notes?: string | null
        }
        Relationships: []
      }
      mp_traffic_organic: {
        Row: {
          clicks: number | null
          created_at: string
          created_by: string | null
          date: string
          engagement: number | null
          id: string
          model_id: string
          platform: string
          posts_count: number
          subs_generated: number | null
        }
        Insert: {
          clicks?: number | null
          created_at?: string
          created_by?: string | null
          date?: string
          engagement?: number | null
          id?: string
          model_id: string
          platform: string
          posts_count?: number
          subs_generated?: number | null
        }
        Update: {
          clicks?: number | null
          created_at?: string
          created_by?: string | null
          date?: string
          engagement?: number | null
          id?: string
          model_id?: string
          platform?: string
          posts_count?: number
          subs_generated?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mp_traffic_organic_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "mp_models"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_traffic_paid: {
        Row: {
          amount_invested: number
          cpa: number | null
          created_at: string
          created_by: string | null
          creator_contacted: string | null
          date: string
          id: string
          model_id: string
          notes: string | null
          subs_obtained: number | null
        }
        Insert: {
          amount_invested?: number
          cpa?: number | null
          created_at?: string
          created_by?: string | null
          creator_contacted?: string | null
          date?: string
          id?: string
          model_id: string
          notes?: string | null
          subs_obtained?: number | null
        }
        Update: {
          amount_invested?: number
          cpa?: number | null
          created_at?: string
          created_by?: string | null
          creator_contacted?: string | null
          date?: string
          id?: string
          model_id?: string
          notes?: string | null
          subs_obtained?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mp_traffic_paid_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "mp_models"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_traffic_sfs: {
        Row: {
          created_at: string
          date: string
          id: string
          model_id: string
          notes: string | null
          partner_handle: string | null
          partner_name: string
          result: string | null
          status: string
          subs_generated: number | null
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          model_id: string
          notes?: string | null
          partner_handle?: string | null
          partner_name: string
          result?: string | null
          status?: string
          subs_generated?: number | null
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          model_id?: string
          notes?: string | null
          partner_handle?: string | null
          partner_name?: string
          result?: string | null
          status?: string
          subs_generated?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mp_traffic_sfs_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "mp_models"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_automation_log: {
        Row: {
          automation_type: string
          id: string
          last_run_at: string | null
          records_processed: number | null
        }
        Insert: {
          automation_type: string
          id?: string
          last_run_at?: string | null
          records_processed?: number | null
        }
        Update: {
          automation_type?: string
          id?: string
          last_run_at?: string | null
          records_processed?: number | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          channel_digest: boolean
          channel_email: boolean | null
          channel_in_app: boolean | null
          channel_push: boolean
          created_at: string | null
          delivery_mode: string
          id: string
          is_enabled: boolean | null
          module: string
          notification_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          channel_digest?: boolean
          channel_email?: boolean | null
          channel_in_app?: boolean | null
          channel_push?: boolean
          created_at?: string | null
          delivery_mode?: string
          id?: string
          is_enabled?: boolean | null
          module: string
          notification_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          channel_digest?: boolean
          channel_email?: boolean | null
          channel_in_app?: boolean | null
          channel_push?: boolean
          created_at?: string | null
          delivery_mode?: string
          id?: string
          is_enabled?: boolean | null
          module?: string
          notification_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          auto_mark_read_on_open: boolean
          created_at: string
          digest_channel: string
          digest_enabled: boolean
          digest_frequency: string
          digest_time: string
          dnd_allow_critical: boolean
          dnd_enabled: boolean
          dnd_end_time: string | null
          dnd_start_time: string | null
          group_similar: boolean
          id: string
          notifications_enabled: boolean
          realtime_enabled: boolean
          show_critical_banners: boolean
          sound_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_mark_read_on_open?: boolean
          created_at?: string
          digest_channel?: string
          digest_enabled?: boolean
          digest_frequency?: string
          digest_time?: string
          dnd_allow_critical?: boolean
          dnd_enabled?: boolean
          dnd_end_time?: string | null
          dnd_start_time?: string | null
          group_similar?: boolean
          id?: string
          notifications_enabled?: boolean
          realtime_enabled?: boolean
          show_critical_banners?: boolean
          sound_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_mark_read_on_open?: boolean
          created_at?: string
          digest_channel?: string
          digest_enabled?: boolean
          digest_frequency?: string
          digest_time?: string
          dnd_allow_critical?: boolean
          dnd_enabled?: boolean
          dnd_end_time?: string | null
          dnd_start_time?: string | null
          group_similar?: boolean
          id?: string
          notifications_enabled?: boolean
          realtime_enabled?: boolean
          show_critical_banners?: boolean
          sound_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          automation_key: string | null
          created_at: string
          deep_link_url: string | null
          id: string
          is_read: boolean
          message: string | null
          module_origin: string | null
          priority: string | null
          reference_id: string | null
          reference_type: string | null
          required_permission_module: string | null
          required_permission_submodule: string | null
          role_target: string | null
          status: string | null
          title: string
          type: string
          user_id: string | null
          visibility_scope: string | null
        }
        Insert: {
          automation_key?: string | null
          created_at?: string
          deep_link_url?: string | null
          id?: string
          is_read?: boolean
          message?: string | null
          module_origin?: string | null
          priority?: string | null
          reference_id?: string | null
          reference_type?: string | null
          required_permission_module?: string | null
          required_permission_submodule?: string | null
          role_target?: string | null
          status?: string | null
          title: string
          type: string
          user_id?: string | null
          visibility_scope?: string | null
        }
        Update: {
          automation_key?: string | null
          created_at?: string
          deep_link_url?: string | null
          id?: string
          is_read?: boolean
          message?: string | null
          module_origin?: string | null
          priority?: string | null
          reference_id?: string | null
          reference_type?: string | null
          required_permission_module?: string | null
          required_permission_submodule?: string | null
          role_target?: string | null
          status?: string | null
          title?: string
          type?: string
          user_id?: string | null
          visibility_scope?: string | null
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          tips_gross?: number | null
          total_earnings_gross?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "of_gross_earnings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "of_gross_earnings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "of_gross_earnings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_promolog_eligible_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "of_gross_earnings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "overtime_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
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
            foreignKeyName: "payroll_details_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
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
          responsible_id: string | null
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
          responsible_id?: string | null
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
          responsible_id?: string | null
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
          {
            foreignKeyName: "performance_evaluations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      pg_net_watchdog_state: {
        Row: {
          checked_at: string | null
          id: number
          last_max_response_id: number | null
          last_note: string | null
          last_queue_count: number | null
          last_restart_at: string | null
          restarts_count: number
        }
        Insert: {
          checked_at?: string | null
          id?: number
          last_max_response_id?: number | null
          last_note?: string | null
          last_queue_count?: number | null
          last_restart_at?: string | null
          restarts_count?: number
        }
        Update: {
          checked_at?: string | null
          id?: number
          last_max_response_id?: number | null
          last_note?: string | null
          last_queue_count?: number | null
          last_restart_at?: string | null
          restarts_count?: number
        }
        Relationships: []
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
      profile_analyses: {
        Row: {
          apify_dataset_id: string | null
          apify_run_id: string | null
          completed_at: string | null
          context: string | null
          cost_usd: number | null
          created_at: string
          duration_seconds: number | null
          error: string | null
          id: string
          instagram_handle: string
          perspective: string | null
          profile: Json | null
          requested_by_display_name: string | null
          requested_by_member_id: string | null
          signals: Json | null
          source_group_id: string | null
          source_message_id: string | null
          status: string
          stories_analysis: Json | null
          stories_count: number | null
          strategy: string | null
          tenant_id: string
        }
        Insert: {
          apify_dataset_id?: string | null
          apify_run_id?: string | null
          completed_at?: string | null
          context?: string | null
          cost_usd?: number | null
          created_at?: string
          duration_seconds?: number | null
          error?: string | null
          id?: string
          instagram_handle: string
          perspective?: string | null
          profile?: Json | null
          requested_by_display_name?: string | null
          requested_by_member_id?: string | null
          signals?: Json | null
          source_group_id?: string | null
          source_message_id?: string | null
          status?: string
          stories_analysis?: Json | null
          stories_count?: number | null
          strategy?: string | null
          tenant_id: string
        }
        Update: {
          apify_dataset_id?: string | null
          apify_run_id?: string | null
          completed_at?: string | null
          context?: string | null
          cost_usd?: number | null
          created_at?: string
          duration_seconds?: number | null
          error?: string | null
          id?: string
          instagram_handle?: string
          perspective?: string | null
          profile?: Json | null
          requested_by_display_name?: string | null
          requested_by_member_id?: string | null
          signals?: Json | null
          source_group_id?: string | null
          source_message_id?: string | null
          status?: string
          stories_analysis?: Json | null
          stories_count?: number | null
          strategy?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_analyses_requested_by_member_id_fkey"
            columns: ["requested_by_member_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_analyses_source_group_id_fkey"
            columns: ["source_group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_analyses_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_analyses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_daily_quota_override: number | null
          avatar_url: string | null
          company_id: string | null
          created_at: string | null
          full_name: string | null
          id: string
          is_owner: boolean
          phone_e164: string | null
          whatsapp_lid: string | null
          whatsapp_push_name: string | null
          whatsapp_verified_at: string | null
        }
        Insert: {
          ai_daily_quota_override?: number | null
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          is_owner?: boolean
          phone_e164?: string | null
          whatsapp_lid?: string | null
          whatsapp_push_name?: string | null
          whatsapp_verified_at?: string | null
        }
        Update: {
          ai_daily_quota_override?: number | null
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          is_owner?: boolean
          phone_e164?: string | null
          whatsapp_lid?: string | null
          whatsapp_push_name?: string | null
          whatsapp_verified_at?: string | null
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
      project_documentation: {
        Row: {
          content: string
          created_at: string
          id: string
          project_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          project_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          project_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_documentation_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "task_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_folders: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string
          id: string
          name: string
          position: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
          position?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_folders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      project_links: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          project_id: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          project_id: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          project_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "task_projects"
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
      promolog_agents: {
        Row: {
          created_at: string
          detalle: Json
          hostname: string | null
          id: string
          last_seen_at: string
        }
        Insert: {
          created_at?: string
          detalle?: Json
          hostname?: string | null
          id: string
          last_seen_at?: string
        }
        Update: {
          created_at?: string
          detalle?: Json
          hostname?: string | null
          id?: string
          last_seen_at?: string
        }
        Relationships: []
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
          {
            foreignKeyName: "promolog_campaigns_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promolog_campaigns_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_promolog_eligible_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      promolog_dispatch_runs: {
        Row: {
          apify_actor_id: string
          apify_run_id: string | null
          cost_usd: number | null
          created_at: string
          creators_count: number
          creators_failed: number
          creators_succeeded: number
          dispatched_by: string | null
          entries_created: number
          error: string | null
          finished_at: string | null
          id: string
          payload: Json | null
          retry_count: number
          started_at: string
          status: string
          tenant_id: string
        }
        Insert: {
          apify_actor_id: string
          apify_run_id?: string | null
          cost_usd?: number | null
          created_at?: string
          creators_count?: number
          creators_failed?: number
          creators_succeeded?: number
          dispatched_by?: string | null
          entries_created?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          payload?: Json | null
          retry_count?: number
          started_at?: string
          status?: string
          tenant_id: string
        }
        Update: {
          apify_actor_id?: string
          apify_run_id?: string | null
          cost_usd?: number | null
          created_at?: string
          creators_count?: number
          creators_failed?: number
          creators_succeeded?: number
          dispatched_by?: string | null
          entries_created?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          payload?: Json | null
          retry_count?: number
          started_at?: string
          status?: string
          tenant_id?: string
        }
        Relationships: []
      }
      promolog_entries: {
        Row: {
          action_taken: string | null
          ai_appeal: number | null
          ai_confidence: number | null
          ai_model: string | null
          ai_reasoning: string | null
          analyzed_by_ai: boolean
          apify_run_id: string | null
          buy_link_type: string | null
          contact_type: string | null
          created_at: string | null
          created_by: string | null
          creator_id: string
          date: string
          dedup_key: string | null
          dia: string | null
          dispatch_run_id: string | null
          error_reason: string | null
          evidence_url: string | null
          has_buy_link: boolean | null
          id: string
          needs_review: boolean
          network: string
          notes: string | null
          platform: string | null
          promoted: string | null
          reviewed_by: string | null
          scraped_at: string | null
          source_handle: string | null
          story_count: number | null
          story_index: number | null
          story_link_url: string | null
          story_media_url: string | null
          story_pk: string | null
          tenant_id: string
          ticket_number: string | null
          updated_at: string | null
        }
        Insert: {
          action_taken?: string | null
          ai_appeal?: number | null
          ai_confidence?: number | null
          ai_model?: string | null
          ai_reasoning?: string | null
          analyzed_by_ai?: boolean
          apify_run_id?: string | null
          buy_link_type?: string | null
          contact_type?: string | null
          created_at?: string | null
          created_by?: string | null
          creator_id: string
          date: string
          dedup_key?: string | null
          dia?: string | null
          dispatch_run_id?: string | null
          error_reason?: string | null
          evidence_url?: string | null
          has_buy_link?: boolean | null
          id?: string
          needs_review?: boolean
          network: string
          notes?: string | null
          platform?: string | null
          promoted?: string | null
          reviewed_by?: string | null
          scraped_at?: string | null
          source_handle?: string | null
          story_count?: number | null
          story_index?: number | null
          story_link_url?: string | null
          story_media_url?: string | null
          story_pk?: string | null
          tenant_id?: string
          ticket_number?: string | null
          updated_at?: string | null
        }
        Update: {
          action_taken?: string | null
          ai_appeal?: number | null
          ai_confidence?: number | null
          ai_model?: string | null
          ai_reasoning?: string | null
          analyzed_by_ai?: boolean
          apify_run_id?: string | null
          buy_link_type?: string | null
          contact_type?: string | null
          created_at?: string | null
          created_by?: string | null
          creator_id?: string
          date?: string
          dedup_key?: string | null
          dia?: string | null
          dispatch_run_id?: string | null
          error_reason?: string | null
          evidence_url?: string | null
          has_buy_link?: boolean | null
          id?: string
          needs_review?: boolean
          network?: string
          notes?: string | null
          platform?: string | null
          promoted?: string | null
          reviewed_by?: string | null
          scraped_at?: string | null
          source_handle?: string | null
          story_count?: number | null
          story_index?: number | null
          story_link_url?: string | null
          story_media_url?: string | null
          story_pk?: string | null
          tenant_id?: string
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
          {
            foreignKeyName: "promolog_entries_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promolog_entries_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_promolog_eligible_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promolog_entries_dispatch_run_id_fkey"
            columns: ["dispatch_run_id"]
            isOneToOne: false
            referencedRelation: "promolog_dispatch_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promolog_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      promolog_entries_backup_sintexto_20260803: {
        Row: {
          action_taken: string | null
          ai_confidence: number | null
          ai_model: string | null
          ai_reasoning: string | null
          analyzed_by_ai: boolean | null
          apify_run_id: string | null
          buy_link_type: string | null
          contact_type: string | null
          created_at: string | null
          created_by: string | null
          creator_id: string | null
          date: string | null
          dedup_key: string | null
          dia: string | null
          dispatch_run_id: string | null
          error_reason: string | null
          evidence_url: string | null
          has_buy_link: boolean | null
          id: string | null
          needs_review: boolean | null
          network: string | null
          notes: string | null
          platform: string | null
          promoted: string | null
          reviewed_by: string | null
          scraped_at: string | null
          source_handle: string | null
          story_count: number | null
          story_index: number | null
          story_link_url: string | null
          story_media_url: string | null
          story_pk: string | null
          tenant_id: string | null
          ticket_number: string | null
          updated_at: string | null
        }
        Insert: {
          action_taken?: string | null
          ai_confidence?: number | null
          ai_model?: string | null
          ai_reasoning?: string | null
          analyzed_by_ai?: boolean | null
          apify_run_id?: string | null
          buy_link_type?: string | null
          contact_type?: string | null
          created_at?: string | null
          created_by?: string | null
          creator_id?: string | null
          date?: string | null
          dedup_key?: string | null
          dia?: string | null
          dispatch_run_id?: string | null
          error_reason?: string | null
          evidence_url?: string | null
          has_buy_link?: boolean | null
          id?: string | null
          needs_review?: boolean | null
          network?: string | null
          notes?: string | null
          platform?: string | null
          promoted?: string | null
          reviewed_by?: string | null
          scraped_at?: string | null
          source_handle?: string | null
          story_count?: number | null
          story_index?: number | null
          story_link_url?: string | null
          story_media_url?: string | null
          story_pk?: string | null
          tenant_id?: string | null
          ticket_number?: string | null
          updated_at?: string | null
        }
        Update: {
          action_taken?: string | null
          ai_confidence?: number | null
          ai_model?: string | null
          ai_reasoning?: string | null
          analyzed_by_ai?: boolean | null
          apify_run_id?: string | null
          buy_link_type?: string | null
          contact_type?: string | null
          created_at?: string | null
          created_by?: string | null
          creator_id?: string | null
          date?: string | null
          dedup_key?: string | null
          dia?: string | null
          dispatch_run_id?: string | null
          error_reason?: string | null
          evidence_url?: string | null
          has_buy_link?: boolean | null
          id?: string | null
          needs_review?: boolean | null
          network?: string | null
          notes?: string | null
          platform?: string | null
          promoted?: string | null
          reviewed_by?: string | null
          scraped_at?: string | null
          source_handle?: string | null
          story_count?: number | null
          story_index?: number | null
          story_link_url?: string | null
          story_media_url?: string | null
          story_pk?: string | null
          tenant_id?: string | null
          ticket_number?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      promolog_handle_check_jobs: {
        Row: {
          apify_run_id: string | null
          completed_at: string | null
          created_at: string
          error: string | null
          group_id: string
          handles: Json
          id: string
          requested_by: string | null
          result: Json | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          apify_run_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          group_id: string
          handles: Json
          id?: string
          requested_by?: string | null
          result?: Json | null
          status?: string
          tenant_id?: string | null
        }
        Update: {
          apify_run_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          group_id?: string
          handles?: Json
          id?: string
          requested_by?: string | null
          result?: Json | null
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promolog_handle_check_jobs_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      promolog_handle_status: {
        Row: {
          checked_at: string
          creator_id: string
          days_empty: number | null
          first_broken_at: string | null
          handle: string
          ig_error: string | null
          resolved_at: string | null
          status: string
        }
        Insert: {
          checked_at?: string
          creator_id: string
          days_empty?: number | null
          first_broken_at?: string | null
          handle: string
          ig_error?: string | null
          resolved_at?: string | null
          status: string
        }
        Update: {
          checked_at?: string
          creator_id?: string
          days_empty?: number | null
          first_broken_at?: string | null
          handle?: string
          ig_error?: string | null
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "promolog_handle_status_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promolog_handle_status_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promolog_handle_status_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "v_promolog_eligible_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      promolog_ig_identity: {
        Row: {
          creator_id: string
          handle: string
          ig_user_id: string
          resolved_at: string
        }
        Insert: {
          creator_id: string
          handle: string
          ig_user_id: string
          resolved_at?: string
        }
        Update: {
          creator_id?: string
          handle?: string
          ig_user_id?: string
          resolved_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promolog_ig_identity_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promolog_ig_identity_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promolog_ig_identity_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_promolog_eligible_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      promolog_scan_notes: {
        Row: {
          active: boolean
          created_at: string
          creator_id: string
          id: string
          network: string | null
          reason: string
          set_by: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          creator_id: string
          id?: string
          network?: string | null
          reason: string
          set_by?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          creator_id?: string
          id?: string
          network?: string | null
          reason?: string
          set_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promolog_scan_notes_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promolog_scan_notes_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promolog_scan_notes_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_promolog_eligible_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promolog_scan_notes_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promolog_scan_notes_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "promolog_scan_notes_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "promolog_scan_notes_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      qa_call_participants: {
        Row: {
          call_id: string
          closer_id: string
          created_at: string
          participation_pct: number
          role: string
          speaker_label: string | null
        }
        Insert: {
          call_id: string
          closer_id: string
          created_at?: string
          participation_pct: number
          role: string
          speaker_label?: string | null
        }
        Update: {
          call_id?: string
          closer_id?: string
          created_at?: string
          participation_pct?: number
          role?: string
          speaker_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qa_call_participants_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "qa_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_call_participants_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_call_participants_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qa_call_participants_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qa_call_participants_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      qa_calls: {
        Row: {
          audio_metrics: Json | null
          audio_path: string | null
          call_date: string
          call_type: string
          claude_analysis: Json
          claude_score: number
          closer_id: string | null
          created_at: string
          error_message: string | null
          evaluator_name: string
          id: string
          model_id: string | null
          report_email_sent_at: string | null
          service_sold: string | null
          status: string
          tenant_id: string
          transcript: string | null
          uploaded_by: string | null
        }
        Insert: {
          audio_metrics?: Json | null
          audio_path?: string | null
          call_date: string
          call_type?: string
          claude_analysis: Json
          claude_score: number
          closer_id?: string | null
          created_at?: string
          error_message?: string | null
          evaluator_name: string
          id?: string
          model_id?: string | null
          report_email_sent_at?: string | null
          service_sold?: string | null
          status?: string
          tenant_id?: string
          transcript?: string | null
          uploaded_by?: string | null
        }
        Update: {
          audio_metrics?: Json | null
          audio_path?: string | null
          call_date?: string
          call_type?: string
          claude_analysis?: Json
          claude_score?: number
          closer_id?: string | null
          created_at?: string
          error_message?: string | null
          evaluator_name?: string
          id?: string
          model_id?: string | null
          report_email_sent_at?: string | null
          service_sold?: string | null
          status?: string
          tenant_id?: string
          transcript?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qa_calls_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_calls_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qa_calls_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qa_calls_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qa_calls_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "qa_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_calls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_chat_messages: {
        Row: {
          cached_tokens: number | null
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
          tenant_id: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          cached_tokens?: number | null
          content: string
          created_at?: string
          id?: string
          role: string
          session_id: string
          tenant_id?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          cached_tokens?: number | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          tenant_id?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "qa_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "qa_chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_chat_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_chat_sessions: {
        Row: {
          created_at: string
          id: string
          scope_closer_id: string | null
          scope_type: string
          tenant_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          scope_closer_id?: string | null
          scope_type: string
          tenant_id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          scope_closer_id?: string | null
          scope_type?: string
          tenant_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_chat_sessions_scope_closer_id_fkey"
            columns: ["scope_closer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_chat_sessions_scope_closer_id_fkey"
            columns: ["scope_closer_id"]
            isOneToOne: false
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qa_chat_sessions_scope_closer_id_fkey"
            columns: ["scope_closer_id"]
            isOneToOne: false
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qa_chat_sessions_scope_closer_id_fkey"
            columns: ["scope_closer_id"]
            isOneToOne: false
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qa_chat_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_closers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          profile_id: string | null
          tenant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          profile_id?: string | null
          tenant_id?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          profile_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_closers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_closers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qa_closers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qa_closers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qa_closers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_config: {
        Row: {
          id: number
          low_score_threshold: number
          notification_emails: string[]
          notify_on_analyzed: boolean
          notify_on_failed: boolean
          notify_on_low_score: boolean
          notify_on_uploaded: boolean
          notify_user_ids: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          id?: number
          low_score_threshold?: number
          notification_emails?: string[]
          notify_on_analyzed?: boolean
          notify_on_failed?: boolean
          notify_on_low_score?: boolean
          notify_on_uploaded?: boolean
          notify_user_ids?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          id?: number
          low_score_threshold?: number
          notification_emails?: string[]
          notify_on_analyzed?: boolean
          notify_on_failed?: boolean
          notify_on_low_score?: boolean
          notify_on_uploaded?: boolean
          notify_user_ids?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_human_feedback: {
        Row: {
          call_id: string
          created_at: string
          evaluator_name: string
          feedback_text: string
          human_score: number | null
          id: string
          tenant_id: string
        }
        Insert: {
          call_id: string
          created_at?: string
          evaluator_name: string
          feedback_text: string
          human_score?: number | null
          id?: string
          tenant_id?: string
        }
        Update: {
          call_id?: string
          created_at?: string
          evaluator_name?: string
          feedback_text?: string
          human_score?: number | null
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_human_feedback_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "qa_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_human_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_models: {
        Row: {
          active: boolean
          avatar_data_url: string | null
          category: string | null
          category_code: string | null
          country: string | null
          created_at: string
          id: string
          ig_url: string | null
          model_id: string | null
          name: string
          tenant_id: string
        }
        Insert: {
          active?: boolean
          avatar_data_url?: string | null
          category?: string | null
          category_code?: string | null
          country?: string | null
          created_at?: string
          id?: string
          ig_url?: string | null
          model_id?: string | null
          name: string
          tenant_id?: string
        }
        Update: {
          active?: boolean
          avatar_data_url?: string | null
          category?: string | null
          category_code?: string | null
          country?: string | null
          created_at?: string
          id?: string
          ig_url?: string | null
          model_id?: string | null
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_models_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "model_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "qa_models_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_models_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_section_feedback: {
        Row: {
          call_id: string
          created_at: string
          evaluator_name: string | null
          id: string
          note: string | null
          section_index: number
          section_label: string | null
          section_type: string
          suggested_score: number | null
          tenant_id: string
          thumbs: number
          updated_at: string
        }
        Insert: {
          call_id: string
          created_at?: string
          evaluator_name?: string | null
          id?: string
          note?: string | null
          section_index: number
          section_label?: string | null
          section_type: string
          suggested_score?: number | null
          tenant_id?: string
          thumbs: number
          updated_at?: string
        }
        Update: {
          call_id?: string
          created_at?: string
          evaluator_name?: string | null
          id?: string
          note?: string | null
          section_index?: number
          section_label?: string | null
          section_type?: string
          suggested_score?: number | null
          tenant_id?: string
          thumbs?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_section_feedback_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "qa_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_section_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      report_recipients: {
        Row: {
          created_at: string
          email: string
          id: string
          schedule_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          schedule_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          schedule_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_recipients_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "report_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      report_schedules: {
        Row: {
          combined_roles: string[] | null
          created_at: string
          created_by: string | null
          dispatch_days_of_month: number[] | null
          dispatch_hour: number
          dispatch_month_of_year: number | null
          dispatch_weekdays: number[] | null
          email_subject: string | null
          id: string
          is_active: boolean
          last_dispatched_at: string | null
          metrics: string[] | null
          module: Database["public"]["Enums"]["report_module"]
          name: string
          period: Database["public"]["Enums"]["report_period"]
          role_name: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          combined_roles?: string[] | null
          created_at?: string
          created_by?: string | null
          dispatch_days_of_month?: number[] | null
          dispatch_hour?: number
          dispatch_month_of_year?: number | null
          dispatch_weekdays?: number[] | null
          email_subject?: string | null
          id?: string
          is_active?: boolean
          last_dispatched_at?: string | null
          metrics?: string[] | null
          module: Database["public"]["Enums"]["report_module"]
          name: string
          period: Database["public"]["Enums"]["report_period"]
          role_name?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          combined_roles?: string[] | null
          created_at?: string
          created_by?: string | null
          dispatch_days_of_month?: number[] | null
          dispatch_hour?: number
          dispatch_month_of_year?: number | null
          dispatch_weekdays?: number[] | null
          email_subject?: string | null
          id?: string
          is_active?: boolean
          last_dispatched_at?: string | null
          metrics?: string[] | null
          module?: Database["public"]["Enums"]["report_module"]
          name?: string
          period?: Database["public"]["Enums"]["report_period"]
          role_name?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
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
      role_base_grants: {
        Row: {
          base_role: string
          created_at: string
          note: string | null
          role_name: string
        }
        Insert: {
          base_role: string
          created_at?: string
          note?: string | null
          role_name: string
        }
        Update: {
          base_role?: string
          created_at?: string
          note?: string | null
          role_name?: string
        }
        Relationships: []
      }
      role_groups: {
        Row: {
          created_at: string
          description: string | null
          is_admin: boolean
          is_manager_or_above: boolean
          is_member: boolean
          is_supervisor_or_above: boolean
          role_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_admin?: boolean
          is_manager_or_above?: boolean
          is_member?: boolean
          is_supervisor_or_above?: boolean
          role_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          is_admin?: boolean
          is_manager_or_above?: boolean
          is_member?: boolean
          is_supervisor_or_above?: boolean
          role_name?: string
          updated_at?: string
        }
        Relationships: []
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
          ai_daily_quota: number | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          ai_daily_quota?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          ai_daily_quota?: number | null
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
      sales_audit_corrections: {
        Row: {
          applied_at: string
          applied_by: string | null
          audit_log_id: string | null
          created_at: string
          creator_name: string
          earnings_date: string
          field_name: string
          id: string
          new_value: number
          of_earnings_id: string
          original_value: number
          reverted_at: string | null
          reverted_by: string | null
          source: string
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          audit_log_id?: string | null
          created_at?: string
          creator_name: string
          earnings_date: string
          field_name?: string
          id?: string
          new_value?: number
          of_earnings_id: string
          original_value?: number
          reverted_at?: string | null
          reverted_by?: string | null
          source?: string
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          audit_log_id?: string | null
          created_at?: string
          creator_name?: string
          earnings_date?: string
          field_name?: string
          id?: string
          new_value?: number
          of_earnings_id?: string
          original_value?: number
          reverted_at?: string | null
          reverted_by?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_audit_corrections_audit_log_id_fkey"
            columns: ["audit_log_id"]
            isOneToOne: false
            referencedRelation: "sales_audit_log"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_audit_log: {
        Row: {
          audit_date: string
          created_at: string
          created_by: string | null
          creator_name: string
          difference: number
          excel_amount: number
          excel_entries: number
          file_name: string | null
          id: string
          notes: string | null
          period_end: string | null
          period_start: string | null
          source_selected: string
          status: string
          system_amount: number
          system_entries: number
        }
        Insert: {
          audit_date?: string
          created_at?: string
          created_by?: string | null
          creator_name: string
          difference?: number
          excel_amount?: number
          excel_entries?: number
          file_name?: string | null
          id?: string
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          source_selected: string
          status?: string
          system_amount?: number
          system_entries?: number
        }
        Update: {
          audit_date?: string
          created_at?: string
          created_by?: string | null
          creator_name?: string
          difference?: number
          excel_amount?: number
          excel_entries?: number
          file_name?: string | null
          id?: string
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          source_selected?: string
          status?: string
          system_amount?: number
          system_entries?: number
        }
        Relationships: []
      }
      scouter_apify_budget: {
        Row: {
          day: string
          est_spend_usd: number
          items_processed: number
          runs_count: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          day: string
          est_spend_usd?: number
          items_processed?: number
          runs_count?: number
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          day?: string
          est_spend_usd?: number
          items_processed?: number
          runs_count?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scouter_apify_budget_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scouter_apify_token_state: {
        Row: {
          cooldown_until: string | null
          last_error: string | null
          requests_today: number
          tenant_id: string
          token_suffix: string
          updated_at: string
        }
        Insert: {
          cooldown_until?: string | null
          last_error?: string | null
          requests_today?: number
          tenant_id?: string
          token_suffix: string
          updated_at?: string
        }
        Update: {
          cooldown_until?: string | null
          last_error?: string | null
          requests_today?: number
          tenant_id?: string
          token_suffix?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scouter_apify_token_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scouter_autopilot: {
        Row: {
          active: boolean
          companies_filter: string[] | null
          last_tick_at: string | null
          paused_at: string | null
          paused_reason: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          companies_filter?: string[] | null
          last_tick_at?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          companies_filter?: string[] | null
          last_tick_at?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scouter_autopilot_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scouter_companies: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          logo_dark_url: string | null
          logo_light_url: string | null
          name: string
          search_config: Json
          slug: string
          tenant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_light_url?: string | null
          name: string
          search_config?: Json
          slug: string
          tenant_id?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_light_url?: string | null
          name?: string
          search_config?: Json
          slug?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scouter_companies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scouter_daily_assignments: {
        Row: {
          ai_reasoning: string | null
          ai_strategy: string | null
          assigned_date: string
          completed_at: string | null
          created_at: string
          id: string
          lead_id: string
          priority: number
          spammer_id: string
          status: string
          tenant_id: string
        }
        Insert: {
          ai_reasoning?: string | null
          ai_strategy?: string | null
          assigned_date?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          lead_id: string
          priority?: number
          spammer_id: string
          status?: string
          tenant_id?: string
        }
        Update: {
          ai_reasoning?: string | null
          ai_strategy?: string | null
          assigned_date?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          priority?: number
          spammer_id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scouter_daily_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scouter_discarded_handles: {
        Row: {
          discarded_at: string
          discarded_by: string | null
          handle: string
          reason: string | null
          tenant_id: string
        }
        Insert: {
          discarded_at?: string
          discarded_by?: string | null
          handle: string
          reason?: string | null
          tenant_id: string
        }
        Update: {
          discarded_at?: string
          discarded_by?: string | null
          handle?: string
          reason?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      scouter_interaction_history: {
        Row: {
          created_at: string
          from_account_id: string
          id: string
          interaction_type: string
          lead_id: string
          notes: string | null
          spammer_id: string
          task_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          from_account_id: string
          id?: string
          interaction_type: string
          lead_id: string
          notes?: string | null
          spammer_id: string
          task_id?: string | null
          tenant_id?: string
        }
        Update: {
          created_at?: string
          from_account_id?: string
          id?: string
          interaction_type?: string
          lead_id?: string
          notes?: string | null
          spammer_id?: string
          task_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scouter_interaction_history_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "scouter_spammer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouter_interaction_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "scouter_interaction_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouter_interaction_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scouter_interaction_tasks: {
        Row: {
          assignment_id: string
          completed_at: string | null
          created_at: string
          from_account_id: string
          id: string
          instruction: string
          screenshot_url: string | null
          sort_order: number
          status: string
          suggested_comment: string | null
          task_type: string
          tenant_id: string
        }
        Insert: {
          assignment_id: string
          completed_at?: string | null
          created_at?: string
          from_account_id: string
          id?: string
          instruction: string
          screenshot_url?: string | null
          sort_order?: number
          status?: string
          suggested_comment?: string | null
          task_type: string
          tenant_id?: string
        }
        Update: {
          assignment_id?: string
          completed_at?: string | null
          created_at?: string
          from_account_id?: string
          id?: string
          instruction?: string
          screenshot_url?: string | null
          sort_order?: number
          status?: string
          suggested_comment?: string | null
          task_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scouter_interaction_tasks_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "scouter_daily_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouter_interaction_tasks_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "scouter_spammer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouter_interaction_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scouter_jobs: {
        Row: {
          attempts: number
          company_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          kind: string
          last_error: string | null
          max_attempts: number
          next_retry_at: string | null
          payload: Json
          priority: number
          result: Json | null
          started_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          attempts?: number
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          priority?: number
          result?: Json | null
          started_at?: string | null
          status?: string
          tenant_id?: string
        }
        Update: {
          attempts?: number
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          priority?: number
          result?: Json | null
          started_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scouter_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "scouter_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouter_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scouter_lead_favorites: {
        Row: {
          created_at: string
          lead_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          lead_id: string
          tenant_id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          lead_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scouter_lead_favorites_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "scouter_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouter_lead_favorites_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_scouter_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouter_lead_favorites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scouter_leads: {
        Row: {
          ai_reason: string | null
          ai_score: number | null
          ai_status: string | null
          assigned_agency: string | null
          assigned_closer: string | null
          bio: string | null
          category: string | null
          category_code: string | null
          city: string | null
          company_id: string
          contact_account: string | null
          contact_touches: Json
          converted_at: string | null
          converted_to_contact_id: string | null
          country: string | null
          created_at: string
          date_active: string | null
          date_added: string | null
          date_confirmed: string | null
          date_contacted: string | null
          date_rejected: string | null
          discovery_source: string | null
          embedding: string | null
          first_scouter_contact_at: string | null
          followers: number | null
          id: string
          instagram_handle: string
          instagram_url: string | null
          link_in_bio_platform: string | null
          look_score: number | null
          lookalike_score: number | null
          lookalike_seed_handle: string | null
          manual_company_assignment: boolean
          model_id: string | null
          monetization_usd: number | null
          name: string | null
          notes: string | null
          onlyfans_url: string | null
          phone: string | null
          phone_first_set_at: string | null
          photo_data_url: string | null
          platform: string | null
          prefilter_score: number
          recent_posts: Json | null
          split_pct: number | null
          status: string
          sub_product: string | null
          target_companies: Json
          tenant_id: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          ai_reason?: string | null
          ai_score?: number | null
          ai_status?: string | null
          assigned_agency?: string | null
          assigned_closer?: string | null
          bio?: string | null
          category?: string | null
          category_code?: string | null
          city?: string | null
          company_id: string
          contact_account?: string | null
          contact_touches?: Json
          converted_at?: string | null
          converted_to_contact_id?: string | null
          country?: string | null
          created_at?: string
          date_active?: string | null
          date_added?: string | null
          date_confirmed?: string | null
          date_contacted?: string | null
          date_rejected?: string | null
          discovery_source?: string | null
          embedding?: string | null
          first_scouter_contact_at?: string | null
          followers?: number | null
          id?: string
          instagram_handle: string
          instagram_url?: string | null
          link_in_bio_platform?: string | null
          look_score?: number | null
          lookalike_score?: number | null
          lookalike_seed_handle?: string | null
          manual_company_assignment?: boolean
          model_id?: string | null
          monetization_usd?: number | null
          name?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          phone?: string | null
          phone_first_set_at?: string | null
          photo_data_url?: string | null
          platform?: string | null
          prefilter_score?: number
          recent_posts?: Json | null
          split_pct?: number | null
          status?: string
          sub_product?: string | null
          target_companies?: Json
          tenant_id?: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          ai_reason?: string | null
          ai_score?: number | null
          ai_status?: string | null
          assigned_agency?: string | null
          assigned_closer?: string | null
          bio?: string | null
          category?: string | null
          category_code?: string | null
          city?: string | null
          company_id?: string
          contact_account?: string | null
          contact_touches?: Json
          converted_at?: string | null
          converted_to_contact_id?: string | null
          country?: string | null
          created_at?: string
          date_active?: string | null
          date_added?: string | null
          date_confirmed?: string | null
          date_contacted?: string | null
          date_rejected?: string | null
          discovery_source?: string | null
          embedding?: string | null
          first_scouter_contact_at?: string | null
          followers?: number | null
          id?: string
          instagram_handle?: string
          instagram_url?: string | null
          link_in_bio_platform?: string | null
          look_score?: number | null
          lookalike_score?: number | null
          lookalike_seed_handle?: string | null
          manual_company_assignment?: boolean
          model_id?: string | null
          monetization_usd?: number | null
          name?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          phone?: string | null
          phone_first_set_at?: string | null
          photo_data_url?: string | null
          platform?: string | null
          prefilter_score?: number
          recent_posts?: Json | null
          split_pct?: number | null
          status?: string
          sub_product?: string | null
          target_companies?: Json
          tenant_id?: string
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "scouter_leads_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "model_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "scouter_leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "scouter_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouter_leads_converted_to_contact_id_fkey"
            columns: ["converted_to_contact_id"]
            isOneToOne: false
            referencedRelation: "closers_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouter_leads_converted_to_contact_id_fkey"
            columns: ["converted_to_contact_id"]
            isOneToOne: false
            referencedRelation: "v_closers_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouter_leads_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouter_leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scouter_notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string
          tenant_id?: string
          user_id: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scouter_notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "scouter_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouter_notification_reads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scouter_notifications: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          tenant_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scouter_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scouter_spammer_accounts: {
        Row: {
          account_niche: string
          active: boolean
          ai_analysis: Json | null
          ai_score: number | null
          bio: string | null
          created_at: string
          display_name: string
          followers_count: number | null
          following_count: number | null
          id: string
          instagram_handle: string
          is_restricted: boolean | null
          is_verified: boolean | null
          last_scanned_at: string | null
          last_synced_at: string | null
          manual_screenshot_path: string | null
          manual_screenshot_paths: string[]
          posts_count: number | null
          profile_pic_url: string | null
          scan_error: string | null
          scan_status: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_niche: string
          active?: boolean
          ai_analysis?: Json | null
          ai_score?: number | null
          bio?: string | null
          created_at?: string
          display_name: string
          followers_count?: number | null
          following_count?: number | null
          id?: string
          instagram_handle: string
          is_restricted?: boolean | null
          is_verified?: boolean | null
          last_scanned_at?: string | null
          last_synced_at?: string | null
          manual_screenshot_path?: string | null
          manual_screenshot_paths?: string[]
          posts_count?: number | null
          profile_pic_url?: string | null
          scan_error?: string | null
          scan_status?: string | null
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_niche?: string
          active?: boolean
          ai_analysis?: Json | null
          ai_score?: number | null
          bio?: string | null
          created_at?: string
          display_name?: string
          followers_count?: number | null
          following_count?: number | null
          id?: string
          instagram_handle?: string
          is_restricted?: boolean | null
          is_verified?: boolean | null
          last_scanned_at?: string | null
          last_synced_at?: string | null
          manual_screenshot_path?: string | null
          manual_screenshot_paths?: string[]
          posts_count?: number | null
          profile_pic_url?: string | null
          scan_error?: string | null
          scan_status?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scouter_spammer_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sophie_daily_stats: {
        Row: {
          account: string
          active_chats: number | null
          ai_enabled: boolean | null
          ai_messages: number
          ai_sales: number
          blu_model_id: number
          date: string
          fans_contacted: number | null
          model_name: string | null
          net_sales: number | null
          offers: number | null
          purchases: number | null
          raw: Json | null
          updated_at: string
          username: string | null
        }
        Insert: {
          account: string
          active_chats?: number | null
          ai_enabled?: boolean | null
          ai_messages?: number
          ai_sales?: number
          blu_model_id: number
          date: string
          fans_contacted?: number | null
          model_name?: string | null
          net_sales?: number | null
          offers?: number | null
          purchases?: number | null
          raw?: Json | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          account?: string
          active_chats?: number | null
          ai_enabled?: boolean | null
          ai_messages?: number
          ai_sales?: number
          blu_model_id?: number
          date?: string
          fans_contacted?: number | null
          model_name?: string | null
          net_sales?: number | null
          offers?: number | null
          purchases?: number | null
          raw?: Json | null
          updated_at?: string
          username?: string | null
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
      super_contact_interactions: {
        Row: {
          contact_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          type: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          type: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "super_contact_interactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "super_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "super_contact_interactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_super_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      super_contact_outreach: {
        Row: {
          brand: string
          contact_id: string
          created_at: string
          created_by: string | null
          id: string
          instagram_account: string | null
          message_type: string
          notes: string | null
          response: string | null
          response_status: string
          screenshot_url: string | null
        }
        Insert: {
          brand: string
          contact_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          instagram_account?: string | null
          message_type?: string
          notes?: string | null
          response?: string | null
          response_status?: string
          screenshot_url?: string | null
        }
        Update: {
          brand?: string
          contact_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          instagram_account?: string | null
          message_type?: string
          notes?: string | null
          response?: string | null
          response_status?: string
          screenshot_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "super_contact_outreach_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "super_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "super_contact_outreach_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_super_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      super_contacts: {
        Row: {
          bio: string | null
          category: string | null
          check_frequency: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          email: string | null
          enriched: boolean
          followers_count: number | null
          full_name: string | null
          id: string
          instagram_handle: string
          last_checked_at: string | null
          notes: string | null
          phone: string | null
          profile_photo_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          bio?: string | null
          category?: string | null
          check_frequency?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          enriched?: boolean
          followers_count?: number | null
          full_name?: string | null
          id?: string
          instagram_handle: string
          last_checked_at?: string | null
          notes?: string | null
          phone?: string | null
          profile_photo_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          bio?: string | null
          category?: string | null
          check_frequency?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          enriched?: boolean
          followers_count?: number | null
          full_name?: string | null
          id?: string
          instagram_handle?: string
          last_checked_at?: string | null
          notes?: string | null
          phone?: string | null
          profile_photo_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          duration_ms: number | null
          error: string | null
          id: number
          ran_at: string
          rows_inserted: number
          rows_skipped: number
          rows_updated: number
          status: string
          synced_through: string
          table_name: string
        }
        Insert: {
          duration_ms?: number | null
          error?: string | null
          id?: number
          ran_at?: string
          rows_inserted?: number
          rows_skipped?: number
          rows_updated?: number
          status: string
          synced_through: string
          table_name: string
        }
        Update: {
          duration_ms?: number | null
          error?: string | null
          id?: number
          ran_at?: string
          rows_inserted?: number
          rows_skipped?: number
          rows_updated?: number
          status?: string
          synced_through?: string
          table_name?: string
        }
        Relationships: []
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
      task_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          task_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number
          file_type?: string
          file_url: string
          id?: string
          task_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          task_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_blockers: {
        Row: {
          blocked_by_user_id: string | null
          created_at: string
          id: string
          reason: string
          reported_by: string
          resolved: boolean
          resolved_at: string | null
          task_id: string
        }
        Insert: {
          blocked_by_user_id?: string | null
          created_at?: string
          id?: string
          reason: string
          reported_by: string
          resolved?: boolean
          resolved_at?: string | null
          task_id: string
        }
        Update: {
          blocked_by_user_id?: string | null
          created_at?: string
          id?: string
          reason?: string
          reported_by?: string
          resolved?: boolean
          resolved_at?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_blockers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
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
          folder_id: string | null
          id: string
          leader_id: string | null
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
          folder_id?: string | null
          id?: string
          leader_id?: string | null
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
          folder_id?: string | null
          id?: string
          leader_id?: string | null
          name?: string
          position?: number
          share_token?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_projects_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "project_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_projects_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_projects_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "task_projects_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "task_projects_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
        ]
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
          task_type: string
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
          task_type?: string
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
          task_type?: string
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
      team_name_aliases: {
        Row: {
          alias: string
          canonical: string
          created_at: string
          id: string
          note: string | null
          tenant_id: string
        }
        Insert: {
          alias: string
          canonical: string
          created_at?: string
          id?: string
          note?: string | null
          tenant_id: string
        }
        Update: {
          alias?: string
          canonical?: string
          created_at?: string
          id?: string
          note?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      tenant_members: {
        Row: {
          created_at: string
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      tg_channels: {
        Row: {
          account_id: string
          created_at: string
          default_assignees: string[]
          id: string
          label: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          default_assignees?: string[]
          id?: string
          label?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          default_assignees?: string[]
          id?: string
          label?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tg_conversation_assignees: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          conversation_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          conversation_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          conversation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tg_conversation_assignees_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "tg_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      tg_conversations: {
        Row: {
          account_id: string
          archived: boolean
          assigned_to: string | null
          closer_creator_id: string | null
          contact_id: string | null
          created_at: string
          creator_id: string | null
          favorite: boolean
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          manually_unread: boolean
          peer_id: string
          peer_name: string | null
          peer_phone: string | null
          peer_username: string | null
          pinned: boolean
          status: string
          tenant_id: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          account_id: string
          archived?: boolean
          assigned_to?: string | null
          closer_creator_id?: string | null
          contact_id?: string | null
          created_at?: string
          creator_id?: string | null
          favorite?: boolean
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          manually_unread?: boolean
          peer_id: string
          peer_name?: string | null
          peer_phone?: string | null
          peer_username?: string | null
          pinned?: boolean
          status?: string
          tenant_id?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          archived?: boolean
          assigned_to?: string | null
          closer_creator_id?: string | null
          contact_id?: string | null
          created_at?: string
          creator_id?: string | null
          favorite?: boolean
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          manually_unread?: boolean
          peer_id?: string
          peer_name?: string | null
          peer_phone?: string | null
          peer_username?: string | null
          pinned?: boolean
          status?: string
          tenant_id?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tg_conversations_closer_creator_id_fkey"
            columns: ["closer_creator_id"]
            isOneToOne: false
            referencedRelation: "closer_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      tg_messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          direction: string
          external_id: string | null
          id: string
          media_url: string | null
          msg_type: string
          reaction: string | null
          reply_to_external_id: string | null
          reply_to_message_id: string | null
          sender_id: string | null
          sender_user_id: string | null
          sent_at: string | null
          source: string | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          direction: string
          external_id?: string | null
          id?: string
          media_url?: string | null
          msg_type?: string
          reaction?: string | null
          reply_to_external_id?: string | null
          reply_to_message_id?: string | null
          sender_id?: string | null
          sender_user_id?: string | null
          sent_at?: string | null
          source?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          direction?: string
          external_id?: string | null
          id?: string
          media_url?: string | null
          msg_type?: string
          reaction?: string | null
          reply_to_external_id?: string | null
          reply_to_message_id?: string | null
          sender_id?: string | null
          sender_user_id?: string | null
          sent_at?: string | null
          source?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tg_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "tg_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tg_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "tg_messages"
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
      ticket_form_fields: {
        Row: {
          created_at: string
          field_key: string
          field_type: string
          form_id: string
          help_text: string | null
          id: string
          is_required: boolean
          label: string
          maps_to: string | null
          options: Json
          placeholder: string | null
          position: number
        }
        Insert: {
          created_at?: string
          field_key: string
          field_type: string
          form_id: string
          help_text?: string | null
          id?: string
          is_required?: boolean
          label: string
          maps_to?: string | null
          options?: Json
          placeholder?: string | null
          position?: number
        }
        Update: {
          created_at?: string
          field_key?: string
          field_type?: string
          form_id?: string
          help_text?: string | null
          id?: string
          is_required?: boolean
          label?: string
          maps_to?: string | null
          options?: Json
          placeholder?: string | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_form_fields_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "ticket_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_forms: {
        Row: {
          archived_at: string | null
          code_prefix: string
          color: string
          created_at: string
          created_by: string | null
          creator_mode: string
          description: string | null
          icon: string
          id: string
          is_published: boolean
          name: string
          next_number: number
          notify_emails: string[]
          notify_enabled: boolean
          position: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          code_prefix: string
          color?: string
          created_at?: string
          created_by?: string | null
          creator_mode?: string
          description?: string | null
          icon?: string
          id?: string
          is_published?: boolean
          name: string
          next_number?: number
          notify_emails?: string[]
          notify_enabled?: boolean
          position?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          code_prefix?: string
          color?: string
          created_at?: string
          created_by?: string | null
          creator_mode?: string
          description?: string | null
          icon?: string
          id?: string
          is_published?: boolean
          name?: string
          next_number?: number
          notify_emails?: string[]
          notify_enabled?: boolean
          position?: number
          updated_at?: string
        }
        Relationships: []
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
          {
            foreignKeyName: "tickets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_promolog_eligible_creators"
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
          {
            foreignKeyName: "time_bank_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
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
          {
            foreignKeyName: "time_bank_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees_directory"
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
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          role: string
          user_id: string
        }
        Update: {
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      wa_bots: {
        Row: {
          active: boolean
          created_at: string
          department: string
          description: string | null
          id: string
          inbox_departments: Json | null
          manual_prompt: string | null
          model: string | null
          name: string
          tenant_id: string
          tool_allowlist: Json | null
          tool_denylist: Json | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          department?: string
          description?: string | null
          id?: string
          inbox_departments?: Json | null
          manual_prompt?: string | null
          model?: string | null
          name: string
          tenant_id?: string
          tool_allowlist?: Json | null
          tool_denylist?: Json | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          department?: string
          description?: string | null
          id?: string
          inbox_departments?: Json | null
          manual_prompt?: string | null
          model?: string | null
          name?: string
          tenant_id?: string
          tool_allowlist?: Json | null
          tool_denylist?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      wa_bots_denylist_backup_20260801: {
        Row: {
          id: string | null
          name: string | null
          respaldado_at: string | null
          tool_denylist: Json | null
        }
        Insert: {
          id?: string | null
          name?: string | null
          respaldado_at?: string | null
          tool_denylist?: Json | null
        }
        Update: {
          id?: string | null
          name?: string | null
          respaldado_at?: string | null
          tool_denylist?: Json | null
        }
        Relationships: []
      }
      wa_bots_manual_prompt_backup_20260731: {
        Row: {
          backed_up_at: string | null
          id: string | null
          manual_prompt: string | null
          name: string | null
        }
        Insert: {
          backed_up_at?: string | null
          id?: string | null
          manual_prompt?: string | null
          name?: string | null
        }
        Update: {
          backed_up_at?: string | null
          id?: string | null
          manual_prompt?: string | null
          name?: string | null
        }
        Relationships: []
      }
      wa_bots_toolconfig_backup_20260818: {
        Row: {
          backed_up_at: string | null
          id: string | null
          name: string | null
          tool_allowlist: Json | null
          tool_denylist: Json | null
        }
        Insert: {
          backed_up_at?: string | null
          id?: string | null
          name?: string | null
          tool_allowlist?: Json | null
          tool_denylist?: Json | null
        }
        Update: {
          backed_up_at?: string | null
          id?: string | null
          name?: string | null
          tool_allowlist?: Json | null
          tool_denylist?: Json | null
        }
        Relationships: []
      }
      wa_channel_members: {
        Row: {
          channel_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "wa_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_channels: {
        Row: {
          active: boolean
          created_at: string
          default_assignees: string[]
          department: string
          evolution_instance: string
          id: string
          label: string | null
          phone_e164: string | null
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_assignees?: string[]
          department?: string
          evolution_instance: string
          id?: string
          label?: string | null
          phone_e164?: string | null
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_assignees?: string[]
          department?: string
          evolution_instance?: string
          id?: string
          label?: string | null
          phone_e164?: string | null
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      wa_contacts: {
        Row: {
          closer_creator_id: string | null
          created_at: string
          display_name: string | null
          id: string
          instagram_handle: string | null
          manual_name: string | null
          phone_e164: string | null
          resolved_name: string | null
          resolved_name_source: string | null
          tenant_id: string
          updated_at: string
          wa_jid: string
        }
        Insert: {
          closer_creator_id?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          instagram_handle?: string | null
          manual_name?: string | null
          phone_e164?: string | null
          resolved_name?: string | null
          resolved_name_source?: string | null
          tenant_id?: string
          updated_at?: string
          wa_jid: string
        }
        Update: {
          closer_creator_id?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          instagram_handle?: string | null
          manual_name?: string | null
          phone_e164?: string | null
          resolved_name?: string | null
          resolved_name_source?: string | null
          tenant_id?: string
          updated_at?: string
          wa_jid?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_contacts_closer_creator_id_fkey"
            columns: ["closer_creator_id"]
            isOneToOne: false
            referencedRelation: "closer_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_conversation_assignees: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          conversation_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          conversation_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          conversation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_conversation_assignees_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_conversation_labels: {
        Row: {
          conversation_id: string
          created_at: string
          label_id: string
          tenant_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          label_id: string
          tenant_id?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          label_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_conversation_labels_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversation_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "wa_labels"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_conversation_messages: {
        Row: {
          agent_reaction: string | null
          body: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          direction: string
          external_id: string | null
          id: string
          is_ai_assisted: boolean
          media_url: string | null
          msg_type: string
          reply_to_message_id: string | null
          sender_user_id: string | null
          sent_at: string
          source: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          agent_reaction?: string | null
          body?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          direction: string
          external_id?: string | null
          id?: string
          is_ai_assisted?: boolean
          media_url?: string | null
          msg_type?: string
          reply_to_message_id?: string | null
          sender_user_id?: string | null
          sent_at?: string
          source?: string | null
          status?: string
          tenant_id?: string
        }
        Update: {
          agent_reaction?: string | null
          body?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          direction?: string
          external_id?: string | null
          id?: string
          is_ai_assisted?: boolean
          media_url?: string | null
          msg_type?: string
          reply_to_message_id?: string | null
          sender_user_id?: string | null
          sent_at?: string
          source?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversation_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "wa_conversation_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_conversations: {
        Row: {
          archived: boolean
          assigned_to: string | null
          channel_id: string | null
          channel_jid: string | null
          contact_id: string
          created_at: string
          department: string
          favorite: boolean
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          last_summarized_message_at: string | null
          manually_unread: boolean
          pinned: boolean
          status: string
          summary: string | null
          summary_model: string | null
          summary_updated_at: string | null
          tenant_id: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          archived?: boolean
          assigned_to?: string | null
          channel_id?: string | null
          channel_jid?: string | null
          contact_id: string
          created_at?: string
          department?: string
          favorite?: boolean
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_summarized_message_at?: string | null
          manually_unread?: boolean
          pinned?: boolean
          status?: string
          summary?: string | null
          summary_model?: string | null
          summary_updated_at?: string | null
          tenant_id?: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          archived?: boolean
          assigned_to?: string | null
          channel_id?: string | null
          channel_jid?: string | null
          contact_id?: string
          created_at?: string
          department?: string
          favorite?: boolean
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_summarized_message_at?: string | null
          manually_unread?: boolean
          pinned?: boolean
          status?: string
          summary?: string | null
          summary_model?: string | null
          summary_updated_at?: string | null
          tenant_id?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_conversations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "wa_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_wa_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "wa_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_copilot_usage: {
        Row: {
          count: number
          usage_date: string
          user_id: string
        }
        Insert: {
          count?: number
          usage_date: string
          user_id: string
        }
        Update: {
          count?: number
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
      wa_dm_allowlist: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string | null
          phone_digits: string
          tenant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string | null
          phone_digits: string
          tenant_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string | null
          phone_digits?: string
          tenant_id?: string
        }
        Relationships: []
      }
      wa_labels: {
        Row: {
          created_at: string
          id: string
          name: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          tenant_id?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      wa_stickers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          storage_path: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          storage_path: string
          tenant_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          storage_path?: string
          tenant_id?: string
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
      whatsapp_agent_claims: {
        Row: {
          claim_key: string
          created_at: string
          group_id: string
        }
        Insert: {
          claim_key: string
          created_at?: string
          group_id: string
        }
        Update: {
          claim_key?: string
          created_at?: string
          group_id?: string
        }
        Relationships: []
      }
      whatsapp_agent_locks: {
        Row: {
          acquired_at: string
          expires_at: string
          group_id: string
          holder: string
        }
        Insert: {
          acquired_at?: string
          expires_at: string
          group_id: string
          holder: string
        }
        Update: {
          acquired_at?: string
          expires_at?: string
          group_id?: string
          holder?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_agent_locks_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_bot_events: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          kind: string
          payload: Json
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          kind: string
          payload?: Json
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          kind?: string
          payload?: Json
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_bot_events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_bot_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_bot_rules: {
        Row: {
          active: boolean
          created_at: string
          created_by_user_id: string
          deactivated_at: string | null
          deactivated_by_user_id: string | null
          expires_at: string | null
          group_id: string | null
          id: string
          rule_text: string
          source_message_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by_user_id: string
          deactivated_at?: string | null
          deactivated_by_user_id?: string | null
          expires_at?: string | null
          group_id?: string | null
          id?: string
          rule_text: string
          source_message_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by_user_id?: string
          deactivated_at?: string | null
          deactivated_by_user_id?: string | null
          expires_at?: string | null
          group_id?: string | null
          id?: string
          rule_text?: string
          source_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_bot_rules_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_bot_rules_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_bot_rules_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_bot_rules_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_bot_rules_deactivated_by_user_id_fkey"
            columns: ["deactivated_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_bot_rules_deactivated_by_user_id_fkey"
            columns: ["deactivated_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_bot_rules_deactivated_by_user_id_fkey"
            columns: ["deactivated_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_bot_rules_deactivated_by_user_id_fkey"
            columns: ["deactivated_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_bot_rules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_catchup_claims: {
        Row: {
          catchup_date: string
          created_at: string
          group_id: string
        }
        Insert: {
          catchup_date: string
          created_at?: string
          group_id: string
        }
        Update: {
          catchup_date?: string
          created_at?: string
          group_id?: string
        }
        Relationships: []
      }
      whatsapp_commitments: {
        Row: {
          committed_by_member_id: string | null
          committed_by_text: string | null
          confidence: number
          created_at: string
          due_at: string | null
          followup_count: number
          group_id: string
          id: string
          item_kind: string
          last_followup_at: string | null
          metadata: Json
          related_entity_id: string | null
          related_entity_type: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by_message_id: string | null
          source_message_id: string
          status: string
          subject: string
          target_subject: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          committed_by_member_id?: string | null
          committed_by_text?: string | null
          confidence?: number
          created_at?: string
          due_at?: string | null
          followup_count?: number
          group_id: string
          id?: string
          item_kind?: string
          last_followup_at?: string | null
          metadata?: Json
          related_entity_id?: string | null
          related_entity_type?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_message_id?: string | null
          source_message_id: string
          status?: string
          subject: string
          target_subject?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          committed_by_member_id?: string | null
          committed_by_text?: string | null
          confidence?: number
          created_at?: string
          due_at?: string | null
          followup_count?: number
          group_id?: string
          id?: string
          item_kind?: string
          last_followup_at?: string | null
          metadata?: Json
          related_entity_id?: string | null
          related_entity_type?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_message_id?: string | null
          source_message_id?: string
          status?: string
          subject?: string
          target_subject?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_commitments_committed_by_member_id_fkey"
            columns: ["committed_by_member_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_commitments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_commitments_resolved_by_message_id_fkey"
            columns: ["resolved_by_message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_commitments_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_commitments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_daily_reports: {
        Row: {
          canceladas: number | null
          cerradas: number | null
          confirmadas: number | null
          contactados: number | null
          created_at: string
          cuentas_creadas: number | null
          fotos_creadas: number | null
          group_id: string | null
          id: string
          links: Json | null
          numeros_obtenidos: number | null
          parsed_extras: Json | null
          posts_subidos: number | null
          raw_text: string | null
          rechazadas: number | null
          report_date: string
          respuestas: number | null
          role_kind: string
          seguimientos: number | null
          source_message_id: string | null
          user_id: string
          videos_creados: number | null
        }
        Insert: {
          canceladas?: number | null
          cerradas?: number | null
          confirmadas?: number | null
          contactados?: number | null
          created_at?: string
          cuentas_creadas?: number | null
          fotos_creadas?: number | null
          group_id?: string | null
          id?: string
          links?: Json | null
          numeros_obtenidos?: number | null
          parsed_extras?: Json | null
          posts_subidos?: number | null
          raw_text?: string | null
          rechazadas?: number | null
          report_date: string
          respuestas?: number | null
          role_kind: string
          seguimientos?: number | null
          source_message_id?: string | null
          user_id: string
          videos_creados?: number | null
        }
        Update: {
          canceladas?: number | null
          cerradas?: number | null
          confirmadas?: number | null
          contactados?: number | null
          created_at?: string
          cuentas_creadas?: number | null
          fotos_creadas?: number | null
          group_id?: string | null
          id?: string
          links?: Json | null
          numeros_obtenidos?: number | null
          parsed_extras?: Json | null
          posts_subidos?: number | null
          raw_text?: string | null
          rechazadas?: number | null
          report_date?: string
          respuestas?: number | null
          role_kind?: string
          seguimientos?: number | null
          source_message_id?: string | null
          user_id?: string
          videos_creados?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_daily_reports_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_daily_reports_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_daily_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_daily_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_daily_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_daily_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      whatsapp_groups: {
        Row: {
          active: boolean
          bot_enabled: boolean
          bot_mode: string
          bot_persona: string | null
          created_at: string
          external_id: string
          id: string
          is_direct: boolean
          last_message_at: string | null
          metadata: Json
          name: string
          provider: string
          tenant_id: string
          timezone: string
          updated_at: string
          wa_bot_id: string | null
        }
        Insert: {
          active?: boolean
          bot_enabled?: boolean
          bot_mode?: string
          bot_persona?: string | null
          created_at?: string
          external_id: string
          id?: string
          is_direct?: boolean
          last_message_at?: string | null
          metadata?: Json
          name: string
          provider?: string
          tenant_id?: string
          timezone?: string
          updated_at?: string
          wa_bot_id?: string | null
        }
        Update: {
          active?: boolean
          bot_enabled?: boolean
          bot_mode?: string
          bot_persona?: string | null
          created_at?: string
          external_id?: string
          id?: string
          is_direct?: boolean
          last_message_at?: string | null
          metadata?: Json
          name?: string
          provider?: string
          tenant_id?: string
          timezone?: string
          updated_at?: string
          wa_bot_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_wa_bot_id_fkey"
            columns: ["wa_bot_id"]
            isOneToOne: false
            referencedRelation: "wa_bots"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_members: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          external_id: string
          group_id: string
          id: string
          last_seen_at: string | null
          metadata: Json
          phone_number: string | null
          role: string | null
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          external_id: string
          group_id: string
          id?: string
          last_seen_at?: string | null
          metadata?: Json
          phone_number?: string | null
          role?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          external_id?: string
          group_id?: string
          id?: string
          last_seen_at?: string | null
          metadata?: Json
          phone_number?: string | null
          role?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          analysis: Json
          analyzed_at: string | null
          body: string | null
          created_at: string
          external_id: string
          group_id: string
          id: string
          is_from_bot: boolean
          media_url: string | null
          member_id: string | null
          msg_type: string
          raw: Json
          received_at: string
          reply_to_external_id: string | null
          sender_display_name: string | null
          sender_external_id: string
          sent_at: string
          tenant_id: string
          transcribed_text: string | null
        }
        Insert: {
          analysis?: Json
          analyzed_at?: string | null
          body?: string | null
          created_at?: string
          external_id: string
          group_id: string
          id?: string
          is_from_bot?: boolean
          media_url?: string | null
          member_id?: string | null
          msg_type?: string
          raw?: Json
          received_at?: string
          reply_to_external_id?: string | null
          sender_display_name?: string | null
          sender_external_id: string
          sent_at: string
          tenant_id?: string
          transcribed_text?: string | null
        }
        Update: {
          analysis?: Json
          analyzed_at?: string | null
          body?: string | null
          created_at?: string
          external_id?: string
          group_id?: string
          id?: string
          is_from_bot?: boolean
          media_url?: string | null
          member_id?: string | null
          msg_type?: string
          raw?: Json
          received_at?: string
          reply_to_external_id?: string | null
          sender_display_name?: string | null
          sender_external_id?: string
          sent_at?: string
          tenant_id?: string
          transcribed_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_pending_posts: {
        Row: {
          body: string
          created_at: string
          expires_at: string | null
          id: string
          nudged_at: string | null
          requested_by_user_id: string | null
          requested_from_group_id: string | null
          sent_at: string | null
          status: string
          target_group_id: string
          tenant_id: string
        }
        Insert: {
          body: string
          created_at?: string
          expires_at?: string | null
          id?: string
          nudged_at?: string | null
          requested_by_user_id?: string | null
          requested_from_group_id?: string | null
          sent_at?: string | null
          status?: string
          target_group_id: string
          tenant_id: string
        }
        Update: {
          body?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          nudged_at?: string | null
          requested_by_user_id?: string | null
          requested_from_group_id?: string | null
          sent_at?: string | null
          status?: string
          target_group_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_pending_posts_requested_from_group_id_fkey"
            columns: ["requested_from_group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_pending_posts_target_group_id_fkey"
            columns: ["target_group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_person_facts: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          fact: string
          group_id: string | null
          id: string
          subject_user_id: string
          tenant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          fact: string
          group_id?: string | null
          id?: string
          subject_user_id: string
          tenant_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          fact?: string
          group_id?: string | null
          id?: string
          subject_user_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_person_facts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_person_facts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_person_facts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_person_facts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_person_facts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_person_facts_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_person_facts_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_person_facts_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_person_facts_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      whatsapp_reminders: {
        Row: {
          attempt_count: number
          body: string | null
          commitment_id: string | null
          created_at: string
          created_by: string | null
          error: string | null
          group_id: string
          id: string
          kind: string
          metadata: Json
          recurrence: string | null
          sent_at: string | null
          sent_message_id: string | null
          series_id: string | null
          status: string
          tenant_id: string
          trigger_at: string
        }
        Insert: {
          attempt_count?: number
          body?: string | null
          commitment_id?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          group_id: string
          id?: string
          kind: string
          metadata?: Json
          recurrence?: string | null
          sent_at?: string | null
          sent_message_id?: string | null
          series_id?: string | null
          status?: string
          tenant_id?: string
          trigger_at?: string
        }
        Update: {
          attempt_count?: number
          body?: string | null
          commitment_id?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          group_id?: string
          id?: string
          kind?: string
          metadata?: Json
          recurrence?: string | null
          sent_at?: string | null
          sent_message_id?: string | null
          series_id?: string | null
          status?: string
          tenant_id?: string
          trigger_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_reminders_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_reminders_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_commitments_overdue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_reminders_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_reminders_sent_message_id_fkey"
            columns: ["sent_message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_reminders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_supervisor_group_state: {
        Row: {
          check_date: string
          check_kind: string
          created_at: string
          group_id: string
          payload: Json
        }
        Insert: {
          check_date: string
          check_kind: string
          created_at?: string
          group_id: string
          payload?: Json
        }
        Update: {
          check_date?: string
          check_kind?: string
          created_at?: string
          group_id?: string
          payload?: Json
        }
        Relationships: []
      }
      whatsapp_supervisor_state: {
        Row: {
          check_date: string
          check_kind: string
          created_at: string
          id: string
          payload: Json
          user_id: string
        }
        Insert: {
          check_date?: string
          check_kind: string
          created_at?: string
          id?: string
          payload?: Json
          user_id: string
        }
        Update: {
          check_date?: string
          check_kind?: string
          created_at?: string
          id?: string
          payload?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_supervisor_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_supervisor_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_supervisor_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_supervisor_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      whatsapp_user_schedules: {
        Row: {
          created_at: string
          daily_goal: number | null
          end_time: string
          role_kind: string
          start_time: string
          updated_at: string
          user_id: string
          weekday: number
        }
        Insert: {
          created_at?: string
          daily_goal?: number | null
          end_time: string
          role_kind: string
          start_time: string
          updated_at?: string
          user_id: string
          weekday: number
        }
        Update: {
          created_at?: string
          daily_goal?: number | null
          end_time?: string
          role_kind?: string
          start_time?: string
          updated_at?: string
          user_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_user_schedules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_user_schedules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_user_schedules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_user_schedules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      whatsapp_user_time_off: {
        Row: {
          announced_by: string | null
          created_at: string
          id: string
          off_date: string
          off_type: string
          partial_end_time: string | null
          partial_start_time: string | null
          reason: string | null
          source: string
          source_message_id: string | null
          user_id: string
        }
        Insert: {
          announced_by?: string | null
          created_at?: string
          id?: string
          off_date: string
          off_type?: string
          partial_end_time?: string | null
          partial_start_time?: string | null
          reason?: string | null
          source?: string
          source_message_id?: string | null
          user_id: string
        }
        Update: {
          announced_by?: string | null
          created_at?: string
          id?: string
          off_date?: string
          off_type?: string
          partial_end_time?: string | null
          partial_start_time?: string | null
          reason?: string | null
          source?: string
          source_message_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_user_time_off_announced_by_fkey"
            columns: ["announced_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_user_time_off_announced_by_fkey"
            columns: ["announced_by"]
            isOneToOne: false
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_user_time_off_announced_by_fkey"
            columns: ["announced_by"]
            isOneToOne: false
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_user_time_off_announced_by_fkey"
            columns: ["announced_by"]
            isOneToOne: false
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_user_time_off_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_user_time_off_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_user_time_off_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_user_time_off_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "whatsapp_user_time_off_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      whatsapp_verification_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          phone_e164: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          phone_e164: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          phone_e164?: string
          used_at?: string | null
          user_id?: string
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
      employees_directory: {
        Row: {
          birth_date: string | null
          company_id: string | null
          contract_type: string | null
          created_at: string | null
          department_id: string | null
          employee_code: string | null
          first_name: string | null
          hire_date: string | null
          id: string | null
          last_name: string | null
          position_id: string | null
          profile_id: string | null
          profile_photo_url: string | null
          reports_to: string | null
          status: string | null
          termination_date: string | null
          updated_at: string | null
          work_modality: string | null
        }
        Insert: {
          birth_date?: string | null
          company_id?: string | null
          contract_type?: string | null
          created_at?: string | null
          department_id?: string | null
          employee_code?: string | null
          first_name?: string | null
          hire_date?: string | null
          id?: string | null
          last_name?: string | null
          position_id?: string | null
          profile_id?: string | null
          profile_photo_url?: string | null
          reports_to?: string | null
          status?: string | null
          termination_date?: string | null
          updated_at?: string | null
          work_modality?: string | null
        }
        Update: {
          birth_date?: string | null
          company_id?: string | null
          contract_type?: string | null
          created_at?: string | null
          department_id?: string | null
          employee_code?: string | null
          first_name?: string | null
          hire_date?: string | null
          id?: string | null
          last_name?: string | null
          position_id?: string | null
          profile_id?: string | null
          profile_photo_url?: string | null
          reports_to?: string | null
          status?: string | null
          termination_date?: string | null
          updated_at?: string | null
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
            foreignKeyName: "employees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "employees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "employees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "employees_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      v_agencies: {
        Row: {
          contact_name: string | null
          country_code: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string | null
          name: string | null
          notes: string | null
          phone: string | null
          status: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          contact_name?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: never
          id?: string | null
          name?: string | null
          notes?: string | null
          phone?: never
          status?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          contact_name?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: never
          id?: string | null
          name?: string | null
          notes?: string | null
          phone?: never
          status?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      v_chatter_anomalies: {
        Row: {
          act: number | null
          blu_employee_id: number | null
          date: string | null
          hours: number | null
          name: string | null
          period: string | null
          tipo: string | null
        }
        Relationships: []
      }
      v_chatter_attendance: {
        Row: {
          blu_employee_id: number | null
          checkin_prom_min: number | null
          dias: number | null
          min_tarde_prom: number | null
          name: string | null
          pct_a_tiempo: number | null
          period: string | null
          shift_start: number | null
          tardanzas: number | null
          turno: string | null
        }
        Relationships: []
      }
      v_chatter_hubstaff_effort: {
        Row: {
          agency_rate_used: number | null
          agency_revenue_usd: number | null
          avg_activity_pct: number | null
          avg_response_min: number | null
          blu_employee_id: number | null
          cost_usd: number | null
          days_tracked: number | null
          fans_chatted: number | null
          margin_usd: number | null
          name: string | null
          no_rentable: boolean | null
          online_improductivo: boolean | null
          period: string | null
          roi_x: number | null
          sales: number | null
          sales_per_hour: number | null
          sin_venta_blu: boolean | null
          sold_messages: number | null
          total_hours: number | null
          unlock_rate: number | null
        }
        Relationships: []
      }
      v_chatter_hubstaff_monthly: {
        Row: {
          avg_activity_pct: number | null
          blu_employee_id: number | null
          days_tracked: number | null
          name: string | null
          period: string | null
          total_hours: number | null
        }
        Relationships: []
      }
      v_closer_hubstaff: {
        Row: {
          avg_activity_pct: number | null
          avg_qa_score: number | null
          cerradas: number | null
          dias: number | null
          leads: number | null
          monetizacion_usd: number | null
          name: string | null
          period: string | null
          qa_calls: number | null
          sin_cierres: boolean | null
          total_hours: number | null
          usd_por_hora: number | null
        }
        Relationships: []
      }
      v_closers_contacts: {
        Row: {
          assigned_to: string | null
          city: string | null
          company: string | null
          company_id: string | null
          contact_kind: string | null
          country_code: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          handle: string | null
          id: string | null
          leadgen_entry_id: string | null
          media_files: Json | null
          model_id: string | null
          name: string | null
          notes: string | null
          onlyfans_url: string | null
          phone: string | null
          phone_first_set_at: string | null
          physical_appearance: string | null
          platform: string | null
          profile_picture_url: string | null
          record_type: string | null
          source: string | null
          status: string | null
          ticket_number: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          city?: string | null
          company?: string | null
          company_id?: string | null
          contact_kind?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: never
          handle?: string | null
          id?: string | null
          leadgen_entry_id?: string | null
          media_files?: Json | null
          model_id?: string | null
          name?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          phone?: never
          phone_first_set_at?: string | null
          physical_appearance?: string | null
          platform?: string | null
          profile_picture_url?: string | null
          record_type?: string | null
          source?: string | null
          status?: string | null
          ticket_number?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          city?: string | null
          company?: string | null
          company_id?: string | null
          contact_kind?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: never
          handle?: string | null
          id?: string | null
          leadgen_entry_id?: string | null
          media_files?: Json | null
          model_id?: string | null
          name?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          phone?: never
          phone_first_set_at?: string | null
          physical_appearance?: string | null
          platform?: string | null
          profile_picture_url?: string | null
          record_type?: string | null
          source?: string | null
          status?: string | null
          ticket_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "closers_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "scouter_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closers_contacts_leadgen_entry_id_fkey"
            columns: ["leadgen_entry_id"]
            isOneToOne: false
            referencedRelation: "leadgen_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closers_contacts_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      v_creator_prospects: {
        Row: {
          agency: string | null
          category: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string | null
          instagram: string | null
          name: string | null
          notes: string | null
          phone: string | null
          platform: string | null
          source: string | null
          status: string | null
          tiktok: string | null
          updated_at: string | null
        }
        Insert: {
          agency?: string | null
          category?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: never
          id?: string | null
          instagram?: string | null
          name?: string | null
          notes?: string | null
          phone?: never
          platform?: string | null
          source?: string | null
          status?: string | null
          tiktok?: string | null
          updated_at?: string | null
        }
        Update: {
          agency?: string | null
          category?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: never
          id?: string | null
          instagram?: string | null
          name?: string | null
          notes?: string | null
          phone?: never
          platform?: string | null
          source?: string | null
          status?: string | null
          tiktok?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      v_creators: {
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
          blu_infloww_active: boolean | null
          category: string | null
          category_code: string | null
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
          created_by: string | null
          currency: string | null
          deporte_equipo: string | null
          dia_perfecto: string | null
          direccion: string | null
          edad_mostrar: number | null
          email: string | null
          emoji_frecuente: string | null
          entered_crm_at: string | null
          entered_crm_by: string | null
          entered_crm_notes: string | null
          estado_civil: string | null
          estatura: string | null
          estrategia_material_gratis: string | null
          estrategia_problemas_personales: string | null
          estrategia_rechazo: string | null
          estrategia_recuperacion: string | null
          etnicidad: string | null
          external_transfer: number | null
          facebook_handle: string | null
          frases_venta: string | null
          gfe_disponible: boolean | null
          helado_favorito: string | null
          hermanos: string | null
          hobbies: string | null
          horarios_sueno: string | null
          id: string | null
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
          model_id: string | null
          musica_artistas: string | null
          name: string | null
          nivel_estudios: string | null
          nivel_lectura: string | null
          notes: string | null
          onlyfans_url: string | null
          orientacion_perfil: string | null
          other_url: string | null
          otras_plataformas: string | null
          palabras_prohibidas: string | null
          peliculas_tv: string | null
          permiso_edad_real: boolean | null
          permiso_nombre_real: boolean | null
          permiso_ubicacion: boolean | null
          personalidad_marca: string | null
          phone: string | null
          phone_e164: string | null
          phone_first_set_at: string | null
          piclink_url: string | null
          plataforma_videollamada: string | null
          precios_contenido: Json | null
          profile_photo_url: string | null
          que_buscas_pareja: string | null
          que_haces_relajarte: string | null
          que_te_hace_reir: string | null
          que_te_incomoda: string | null
          que_te_motiva_crear: string | null
          reddit_handle: string | null
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
          telegram_handle: string | null
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
          blu_infloww_active?: boolean | null
          category?: string | null
          category_code?: string | null
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
          created_by?: string | null
          currency?: string | null
          deporte_equipo?: string | null
          dia_perfecto?: string | null
          direccion?: string | null
          edad_mostrar?: number | null
          email?: never
          emoji_frecuente?: string | null
          entered_crm_at?: string | null
          entered_crm_by?: string | null
          entered_crm_notes?: string | null
          estado_civil?: string | null
          estatura?: string | null
          estrategia_material_gratis?: string | null
          estrategia_problemas_personales?: string | null
          estrategia_rechazo?: string | null
          estrategia_recuperacion?: string | null
          etnicidad?: string | null
          external_transfer?: number | null
          facebook_handle?: string | null
          frases_venta?: string | null
          gfe_disponible?: boolean | null
          helado_favorito?: string | null
          hermanos?: string | null
          hobbies?: string | null
          horarios_sueno?: string | null
          id?: string | null
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
          model_id?: string | null
          musica_artistas?: string | null
          name?: string | null
          nivel_estudios?: string | null
          nivel_lectura?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          orientacion_perfil?: string | null
          other_url?: string | null
          otras_plataformas?: string | null
          palabras_prohibidas?: string | null
          peliculas_tv?: string | null
          permiso_edad_real?: boolean | null
          permiso_nombre_real?: boolean | null
          permiso_ubicacion?: boolean | null
          personalidad_marca?: string | null
          phone?: never
          phone_e164?: never
          phone_first_set_at?: string | null
          piclink_url?: string | null
          plataforma_videollamada?: string | null
          precios_contenido?: Json | null
          profile_photo_url?: string | null
          que_buscas_pareja?: string | null
          que_haces_relajarte?: string | null
          que_te_hace_reir?: string | null
          que_te_incomoda?: string | null
          que_te_motiva_crear?: string | null
          reddit_handle?: string | null
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
          telegram_handle?: string | null
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
          whatsapp_number?: never
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
          blu_infloww_active?: boolean | null
          category?: string | null
          category_code?: string | null
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
          created_by?: string | null
          currency?: string | null
          deporte_equipo?: string | null
          dia_perfecto?: string | null
          direccion?: string | null
          edad_mostrar?: number | null
          email?: never
          emoji_frecuente?: string | null
          entered_crm_at?: string | null
          entered_crm_by?: string | null
          entered_crm_notes?: string | null
          estado_civil?: string | null
          estatura?: string | null
          estrategia_material_gratis?: string | null
          estrategia_problemas_personales?: string | null
          estrategia_rechazo?: string | null
          estrategia_recuperacion?: string | null
          etnicidad?: string | null
          external_transfer?: number | null
          facebook_handle?: string | null
          frases_venta?: string | null
          gfe_disponible?: boolean | null
          helado_favorito?: string | null
          hermanos?: string | null
          hobbies?: string | null
          horarios_sueno?: string | null
          id?: string | null
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
          model_id?: string | null
          musica_artistas?: string | null
          name?: string | null
          nivel_estudios?: string | null
          nivel_lectura?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          orientacion_perfil?: string | null
          other_url?: string | null
          otras_plataformas?: string | null
          palabras_prohibidas?: string | null
          peliculas_tv?: string | null
          permiso_edad_real?: boolean | null
          permiso_nombre_real?: boolean | null
          permiso_ubicacion?: boolean | null
          personalidad_marca?: string | null
          phone?: never
          phone_e164?: never
          phone_first_set_at?: string | null
          piclink_url?: string | null
          plataforma_videollamada?: string | null
          precios_contenido?: Json | null
          profile_photo_url?: string | null
          que_buscas_pareja?: string | null
          que_haces_relajarte?: string | null
          que_te_hace_reir?: string | null
          que_te_incomoda?: string | null
          que_te_motiva_crear?: string | null
          reddit_handle?: string | null
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
          telegram_handle?: string | null
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
          whatsapp_number?: never
          wishlist_amazon?: string | null
          wishlist_url?: string | null
          youtube_handle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creators_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "model_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "creators_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      v_hr_payroll: {
        Row: {
          base_salary_cop: number | null
          cost_modelado: boolean | null
          cost_usd: number | null
          in_hubstaff: boolean | null
          margin_usd: number | null
          name: string | null
          profile_id: string | null
          revenue_usd: number | null
          roi_x: number | null
          role: string | null
        }
        Relationships: []
      }
      v_hr_roster: {
        Row: {
          hubstaff_user_id: string | null
          in_hubstaff: boolean | null
          name: string | null
          profile_id: string | null
          role: string | null
        }
        Insert: {
          hubstaff_user_id?: never
          in_hubstaff?: never
          name?: string | null
          profile_id?: string | null
          role?: never
        }
        Update: {
          hubstaff_user_id?: never
          in_hubstaff?: never
          name?: string | null
          profile_id?: string | null
          role?: never
        }
        Relationships: []
      }
      v_llg_hubstaff: {
        Row: {
          avg_activity_pct: number | null
          dias: number | null
          leads: number | null
          leads_por_hora: number | null
          name: string | null
          period: string | null
          total_hours: number | null
        }
        Relationships: []
      }
      v_model_phone_captures: {
        Row: {
          captured_at: string | null
          handle: string | null
          phone: string | null
          phone_norm: string | null
          source_id: string | null
          source_table: string | null
        }
        Relationships: []
      }
      v_my_mail_connection: {
        Row: {
          connected_at: string | null
          email_address: string | null
          has_error: boolean | null
          id: string | null
          is_active: boolean | null
          last_used_at: string | null
          provider: string | null
          revoked_at: string | null
        }
        Insert: {
          connected_at?: string | null
          email_address?: string | null
          has_error?: never
          id?: string | null
          is_active?: never
          last_used_at?: string | null
          provider?: string | null
          revoked_at?: string | null
        }
        Update: {
          connected_at?: string | null
          email_address?: string | null
          has_error?: never
          id?: string | null
          is_active?: never
          last_used_at?: string | null
          provider?: string | null
          revoked_at?: string | null
        }
        Relationships: []
      }
      v_promolog_eligible_creators: {
        Row: {
          artistic_name: string | null
          assigned_manager_profile_id: string | null
          assigned_specialist_profile_id: string | null
          id: string | null
          instagram_followers: number | null
          instagram_handle: string | null
          name: string | null
          onlyfans_url: string | null
        }
        Insert: {
          artistic_name?: string | null
          assigned_manager_profile_id?: string | null
          assigned_specialist_profile_id?: string | null
          id?: string | null
          instagram_followers?: number | null
          instagram_handle?: string | null
          name?: string | null
          onlyfans_url?: string | null
        }
        Update: {
          artistic_name?: string | null
          assigned_manager_profile_id?: string | null
          assigned_specialist_profile_id?: string | null
          id?: string | null
          instagram_followers?: number | null
          instagram_handle?: string | null
          name?: string | null
          onlyfans_url?: string | null
        }
        Relationships: []
      }
      v_qa_anomalies: {
        Row: {
          act: number | null
          date: string | null
          hours: number | null
          hubstaff_user_id: string | null
          name: string | null
          period: string | null
          role: string | null
          tipo: string | null
        }
        Relationships: []
      }
      v_qa_attendance: {
        Row: {
          checkin_prom_min: number | null
          dias: number | null
          horario_cargado: boolean | null
          hubstaff_user_id: string | null
          min_tarde_prom: number | null
          name: string | null
          pct_a_tiempo: number | null
          period: string | null
          role: string | null
          shift_start: number | null
          tardanzas: number | null
          turno: string | null
        }
        Relationships: []
      }
      v_qa_effort: {
        Row: {
          avg_activity_pct: number | null
          dias: number | null
          hubstaff_user_id: string | null
          name: string | null
          period: string | null
          profile_id: string | null
          role: string | null
          total_hours: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hubstaff_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hubstaff_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "v_hr_payroll"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "hubstaff_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "v_hr_roster"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "hubstaff_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "v_qa_staff"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      v_qa_staff: {
        Row: {
          in_hubstaff: boolean | null
          name: string | null
          profile_id: string | null
          role: string | null
        }
        Insert: {
          in_hubstaff?: never
          name?: string | null
          profile_id?: string | null
          role?: never
        }
        Update: {
          in_hubstaff?: never
          name?: string | null
          profile_id?: string | null
          role?: never
        }
        Relationships: []
      }
      v_scouter_leads: {
        Row: {
          ai_reason: string | null
          ai_score: number | null
          ai_status: string | null
          assigned_agency: string | null
          assigned_closer: string | null
          bio: string | null
          category: string | null
          category_code: string | null
          city: string | null
          company_id: string | null
          contact_account: string | null
          contact_touches: Json | null
          converted_at: string | null
          converted_to_contact_id: string | null
          country: string | null
          created_at: string | null
          date_active: string | null
          date_added: string | null
          date_confirmed: string | null
          date_contacted: string | null
          date_rejected: string | null
          discovery_source: string | null
          first_scouter_contact_at: string | null
          followers: number | null
          id: string | null
          instagram_handle: string | null
          instagram_url: string | null
          link_in_bio_platform: string | null
          look_score: number | null
          lookalike_score: number | null
          lookalike_seed_handle: string | null
          manual_company_assignment: boolean | null
          model_id: string | null
          monetization_usd: number | null
          name: string | null
          notes: string | null
          onlyfans_url: string | null
          phone: string | null
          phone_first_set_at: string | null
          photo_data_url: string | null
          platform: string | null
          prefilter_score: number | null
          recent_posts: Json | null
          split_pct: number | null
          status: string | null
          sub_product: string | null
          target_companies: Json | null
          tenant_id: string | null
          updated_at: string | null
          verified: boolean | null
        }
        Insert: {
          ai_reason?: string | null
          ai_score?: number | null
          ai_status?: string | null
          assigned_agency?: string | null
          assigned_closer?: string | null
          bio?: string | null
          category?: string | null
          category_code?: string | null
          city?: string | null
          company_id?: string | null
          contact_account?: string | null
          contact_touches?: Json | null
          converted_at?: string | null
          converted_to_contact_id?: string | null
          country?: string | null
          created_at?: string | null
          date_active?: string | null
          date_added?: string | null
          date_confirmed?: string | null
          date_contacted?: string | null
          date_rejected?: string | null
          discovery_source?: string | null
          first_scouter_contact_at?: string | null
          followers?: number | null
          id?: string | null
          instagram_handle?: string | null
          instagram_url?: string | null
          link_in_bio_platform?: string | null
          look_score?: number | null
          lookalike_score?: number | null
          lookalike_seed_handle?: string | null
          manual_company_assignment?: boolean | null
          model_id?: string | null
          monetization_usd?: number | null
          name?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          phone?: never
          phone_first_set_at?: string | null
          photo_data_url?: string | null
          platform?: string | null
          prefilter_score?: number | null
          recent_posts?: Json | null
          split_pct?: number | null
          status?: string | null
          sub_product?: string | null
          target_companies?: Json | null
          tenant_id?: string | null
          updated_at?: string | null
          verified?: boolean | null
        }
        Update: {
          ai_reason?: string | null
          ai_score?: number | null
          ai_status?: string | null
          assigned_agency?: string | null
          assigned_closer?: string | null
          bio?: string | null
          category?: string | null
          category_code?: string | null
          city?: string | null
          company_id?: string | null
          contact_account?: string | null
          contact_touches?: Json | null
          converted_at?: string | null
          converted_to_contact_id?: string | null
          country?: string | null
          created_at?: string | null
          date_active?: string | null
          date_added?: string | null
          date_confirmed?: string | null
          date_contacted?: string | null
          date_rejected?: string | null
          discovery_source?: string | null
          first_scouter_contact_at?: string | null
          followers?: number | null
          id?: string | null
          instagram_handle?: string | null
          instagram_url?: string | null
          link_in_bio_platform?: string | null
          look_score?: number | null
          lookalike_score?: number | null
          lookalike_seed_handle?: string | null
          manual_company_assignment?: boolean | null
          model_id?: string | null
          monetization_usd?: number | null
          name?: string | null
          notes?: string | null
          onlyfans_url?: string | null
          phone?: never
          phone_first_set_at?: string | null
          photo_data_url?: string | null
          platform?: string | null
          prefilter_score?: number | null
          recent_posts?: Json | null
          split_pct?: number | null
          status?: string | null
          sub_product?: string | null
          target_companies?: Json | null
          tenant_id?: string | null
          updated_at?: string | null
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "scouter_leads_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "model_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "scouter_leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "scouter_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouter_leads_converted_to_contact_id_fkey"
            columns: ["converted_to_contact_id"]
            isOneToOne: false
            referencedRelation: "closers_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouter_leads_converted_to_contact_id_fkey"
            columns: ["converted_to_contact_id"]
            isOneToOne: false
            referencedRelation: "v_closers_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouter_leads_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouter_leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_super_contacts: {
        Row: {
          bio: string | null
          category: string | null
          check_frequency: string | null
          city: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          enriched: boolean | null
          followers_count: number | null
          full_name: string | null
          id: string | null
          instagram_handle: string | null
          last_checked_at: string | null
          notes: string | null
          phone: string | null
          profile_photo_url: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          bio?: string | null
          category?: string | null
          check_frequency?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: never
          enriched?: boolean | null
          followers_count?: number | null
          full_name?: string | null
          id?: string | null
          instagram_handle?: string | null
          last_checked_at?: string | null
          notes?: string | null
          phone?: never
          profile_photo_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          bio?: string | null
          category?: string | null
          check_frequency?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: never
          enriched?: boolean | null
          followers_count?: number | null
          full_name?: string | null
          id?: string | null
          instagram_handle?: string | null
          last_checked_at?: string | null
          notes?: string | null
          phone?: never
          profile_photo_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      v_wa_contacts: {
        Row: {
          closer_creator_id: string | null
          created_at: string | null
          display_name: string | null
          id: string | null
          instagram_handle: string | null
          phone: string | null
          tenant_id: string | null
          updated_at: string | null
          wa_jid: string | null
        }
        Insert: {
          closer_creator_id?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          instagram_handle?: string | null
          phone?: never
          tenant_id?: string | null
          updated_at?: string | null
          wa_jid?: string | null
        }
        Update: {
          closer_creator_id?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          instagram_handle?: string | null
          phone?: never
          tenant_id?: string | null
          updated_at?: string | null
          wa_jid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_contacts_closer_creator_id_fkey"
            columns: ["closer_creator_id"]
            isOneToOne: false
            referencedRelation: "closer_creators"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_commitments_overdue: {
        Row: {
          committed_by_display_name: string | null
          committed_by_member_id: string | null
          committed_by_text: string | null
          confidence: number | null
          created_at: string | null
          due_at: string | null
          followup_count: number | null
          group_id: string | null
          group_name: string | null
          hours_overdue: number | null
          id: string | null
          last_followup_at: string | null
          metadata: Json | null
          related_entity_id: string | null
          related_entity_type: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by_message_id: string | null
          source_message_id: string | null
          status: string | null
          subject: string | null
          target_subject: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_commitments_committed_by_member_id_fkey"
            columns: ["committed_by_member_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_commitments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_commitments_resolved_by_message_id_fkey"
            columns: ["resolved_by_message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_commitments_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_commitments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_costs_by_group_month: {
        Row: {
          agent_auto_cost: number | null
          agent_cost: number | null
          agent_mention_cost: number | null
          audio_cost: number | null
          calls: number | null
          cost_usd: number | null
          extract_cost: number | null
          group_id: string | null
          image_cost: number | null
          month: string | null
          tenant_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_ticket_from_form: {
        Args: { p_answers: Json; p_creator_id?: string; p_form_id: string }
        Returns: {
          answers: Json
          assigned_to: string | null
          company: string | null
          created_at: string | null
          creator_id: string | null
          creator_notes: string | null
          description: string | null
          form_id: string | null
          id: string
          priority: string
          status: string
          ticket_code: string | null
          ticket_type: string
          title: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      next_ticket_code: { Args: { p_form_id: string }; Returns: string }
      alvaro_pulse: { Args: { p_dry_run?: boolean }; Returns: string }
      api_usage_summary: { Args: { _from: string; _to: string }; Returns: Json }
      app_force_delete_auth_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      app_get_chatter_messages: {
        Args: { p_session_id: string }
        Returns: {
          content: string | null
          content_history: Json
          created_at: string
          deleted: string | null
          edited_at: string | null
          examiner_user_id: string | null
          from_examiner: boolean
          id: string
          images: string[]
          msg_type: string
          price: number | null
          purchased: boolean
          reactions: Json
          reply_to_id: string | null
          role: string
          session_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "chatter_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      app_purge_user_refs: { Args: { p_user_id: string }; Returns: undefined }
      assign_closer_to_contact: {
        Args: { p_closer_id: string; p_contact_id: string }
        Returns: string
      }
      blu_ignore_creator: { Args: { p_blu_name: string }; Returns: undefined }
      blu_is_management: { Args: { p_uid: string }; Returns: boolean }
      blu_list_orphans: {
        Args: never
        Returns: {
          blu_name: string
          days: number
          first_date: string
          last_date: string
          total_gross: number
        }[]
      }
      blu_map_creator: {
        Args: { p_blu_name: string; p_creator_id: string }
        Returns: number
      }
      blu_match_creator: { Args: { p_blu_name: string }; Returns: string }
      blu_normalize: { Args: { p: string }; Returns: string }
      blu_pending_mappings: {
        Args: never
        Returns: {
          blu_name: string
          dias: number
          total_gross: number
        }[]
      }
      blu_relink_orphans: { Args: { p_blu_name?: string }; Returns: Json }
      blu_set_creator_mapping: {
        Args: { p_blu_name: string; p_creator_id: string; p_ignore?: boolean }
        Returns: number
      }
      can_access_chatters_qa: { Args: { p_uid: string }; Returns: boolean }
      can_create_cowork_session: {
        Args: { _user_id: string }
        Returns: boolean
      }
      can_see_contact_phone: { Args: never; Returns: boolean }
      can_use_blu_mp: { Args: { p_uid: string }; Returns: boolean }
      can_use_module_function: {
        Args: {
          _fallback_group?: string
          _module: string
          _submodule: string
          _user_id: string
        }
        Returns: boolean
      }
      canonical_phone: { Args: { p: string }; Returns: string }
      chatter_sessions_total_spent: {
        Args: never
        Returns: {
          session_id: string
          total_spent: number
        }[]
      }
      chatter_sessions_unread_counts: {
        Args: never
        Returns: {
          session_id: string
          unread_count: number
        }[]
      }
      check_closer_contact_alerts: { Args: never; Returns: undefined }
      claim_whatsapp_verification_code: {
        Args: { p_code: string; p_lid: string; p_push_name: string }
        Returns: string
      }
      cleanup_duplicate_leadgen_entries: { Args: never; Returns: number }
      cleanup_old_scouter_jobs: { Args: never; Returns: number }
      closer_calls_count: {
        Args: { p_closer_id: string; p_since?: string }
        Returns: number
      }
      closer_closed_calls: {
        Args: { p_closer_id: string; p_since?: string }
        Returns: number
      }
      closer_scope_agent_ids: { Args: never; Returns: string[] }
      contact_filter_agents: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      contact_filter_cities: { Args: never; Returns: string[] }
      contact_ids_by_city: { Args: { p_city: string }; Returns: string[] }
      convert_contact_to_creator: {
        Args: { p_contact_id: string }
        Returns: string
      }
      convert_scouter_lead: { Args: { p_lead_id: string }; Returns: string }
      corte_cierre_prep: { Args: { p_group_id: string }; Returns: Json }
      corte_hubstaff_bloque: { Args: { p_group_id?: string }; Returns: string }
      corte_jornada_bloque: { Args: { p_group_id: string }; Returns: string }
      corte_nota_formula: {
        Args: {
          p_avance: number
          p_franjas: number
          p_franjas_max: number
          p_hub_act: number
          p_hub_h: number
          p_hub_ref: number
        }
        Returns: number
      }
      corte_ventas_bloque: { Args: never; Returns: string }
      create_platform_deal_for_contact: {
        Args: {
          p_closer_id?: string
          p_contact_id: string
          p_platform: string
          p_subscription_amount: number
        }
        Returns: string
      }
      create_platform_deal_for_creator: {
        Args: {
          p_closer_id?: string
          p_creator_id: string
          p_platform: string
          p_subscription_amount: number
        }
        Returns: string
      }
      create_recruitment_deal_for_contact: {
        Args: {
          p_agency_commission?: number
          p_closer_id?: string
          p_contact_id: string
          p_estimated_monetization?: number
        }
        Returns: string
      }
      create_recruitment_deal_for_creator: {
        Args: {
          p_agency_commission?: number
          p_closer_id?: string
          p_creator_id: string
          p_estimated_monetization?: number
        }
        Returns: string
      }
      crm_movements_in_range: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      current_tenant_id: { Args: never; Returns: string }
      dashboard2_cohort_retention: {
        Args: { p_creator?: string; p_from: string; p_to: string }
        Returns: {
          cohort_date: string
          cohort_size: number
          day_offset: number
          retention_pct: number
        }[]
      }
      delete_conversation_cascade: {
        Args: { _conversation_id: string }
        Returns: undefined
      }
      end_expired_chatter_sessions: { Args: never; Returns: number }
      find_contact_name_by_phone: { Args: { p_phone: string }; Returns: string }
      find_creator_history_by_handle: {
        Args: { p_handle: string }
        Returns: {
          creator_id: string
          last_change: string
          name: string
          source: string
          status: string
        }[]
      }
      find_creator_name_by_email: { Args: { p_email: string }; Returns: string }
      find_creator_name_by_phone: { Args: { p_phone: string }; Returns: string }
      gen_cowork_join_code: { Args: never; Returns: string }
      gen_meet_code: { Args: never; Returns: string }
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
      get_agent_names: {
        Args: { _user_ids: string[] }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      get_assignable_closers: {
        Args: never
        Returns: {
          full_name: string
          id: string
        }[]
      }
      get_blu_sales_summary: {
        Args: {
          p_detalle?: boolean
          p_from: string
          p_kash: string
          p_tenant: string
          p_to: string
        }
        Returns: Json
      }
      get_chatter_effort_range: {
        Args: { p_from: string; p_to: string }
        Returns: {
          avg_activity_pct: number
          blu_employee_id: number
          days_tracked: number
          name: string
          total_hours: number
        }[]
      }
      get_chatter_sales_range: {
        Args: { p_from: string; p_to: string }
        Returns: {
          agency_revenue_usd: number
          blu_employee_id: number
          cost_usd: number
          margin_usd: number
          name: string
          roi_x: number
          sales: number
          sin_venta_blu: boolean
        }[]
      }
      get_closer_activity: {
        Args: { p_from: string; p_to: string }
        Returns: {
          auto_contacts: number
          by_channel: Json
          by_result: Json
          employee_id: string
          employee_name: string
          last_activity: string
          leads_assigned: number
          leads_overdue: number
          leads_touched: number
          manual_contacts: number
          total_contacts: number
        }[]
      }
      get_closer_activity_detail: {
        Args: { p_employee: string; p_from: string; p_to: string }
        Returns: {
          channel: string
          contact_date: string
          contact_id: string
          is_auto: boolean
          lead_category: string
          lead_handle: string
          lead_id: string
          lead_monetization: number
          lead_stage: string
          notes: string
          result: string
        }[]
      }
      get_closer_agents: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      get_closer_stage_counts:
        | {
            Args: { _is_admin: boolean; _user_id: string }
            Returns: {
              cnt: number
              stage: string
            }[]
          }
        | {
            Args: { p_assigned_to?: string }
            Returns: {
              stage_name: string
              total: number
            }[]
          }
      get_closers_roster: {
        Args: never
        Returns: {
          full_name: string
          id: string
        }[]
      }
      get_contact_funnel_list: {
        Args: { p_bucket: string; p_from?: string; p_to?: string }
        Returns: {
          city: string
          country_code: string
          created_at: string
          handle: string
          id: string
          name: string
          physical_appearance: string
          profile_picture_url: string
          status: string
        }[]
      }
      get_contact_funnel_stats: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      get_contact_history: {
        Args: { p_contact_id: string }
        Returns: {
          detail: string
          event_at: string
          kind: string
          title: string
        }[]
      }
      get_contact_private: {
        Args: { p_id: string }
        Returns: {
          phone: string
        }[]
      }
      get_contact_sales_channels: { Args: never; Returns: Json }
      get_contact_statuses: { Args: never; Returns: Json }
      get_cowork_user_room: {
        Args: { _session_id: string; _user_id: string }
        Returns: string
      }
      get_creator_earnings_range: {
        Args: {
          p_from: string
          p_query: string
          p_tenant: string
          p_to: string
        }
        Returns: Json
      }
      get_creator_scan_config: {
        Args: { p_query: string; p_tenant: string }
        Returns: Json
      }
      get_creator_top_fans: {
        Args: {
          p_limit?: number
          p_period?: string
          p_query: string
          p_tenant: string
        }
        Returns: Json
      }
      get_dashboard2_creator_summary: {
        Args: { p_from: string; p_to: string }
        Returns: {
          af_days: number
          af_sum: number
          artistic_name: string
          blu_creator_name: string
          creator_id: string
          days_with_data: number
          group_key: string
          last_date: string
          max_active_fans: number
          messages: number
          new_fans: number
          new_sub: number
          recurring_sub: number
          subs: number
          tips: number
          total: number
        }[]
      }
      get_distinct_promolog_agents: {
        Args: never
        Returns: {
          agent_id: string
        }[]
      }
      get_hr_person_card: { Args: { p_profile_id: string }; Returns: Json }
      get_lead_outcomes_de_origen: {
        Args: { p_days?: number; p_query: string; p_tenant: string }
        Returns: Json
      }
      get_manager_growth_feed: {
        Args: {
          p_income_drop_pct?: number
          p_low_promo_rate?: number
          p_tenant: string
        }
        Returns: {
          category: string
          covered_days: number
          creator_id: string
          diagnosis: string
          ig_has_data: boolean
          ig_promo_days: number
          ig_read_days: number
          income_mtd: number
          income_prev_mtd: number
          income_trend_pct: number
          instagram_handle: string
          manager_name: string
          manager_phone: string
          manager_profile_id: string
          mtd_day: number
          name: string
          priority: number
          promo_days: number
          promo_networks: string
          quadrant: string
        }[]
      }
      get_manager_roster_stats: {
        Args: { p_date?: string; p_tenant: string }
        Returns: {
          contacted_count: number
          contacted_pct: number
          covered_count: number
          effective_date: string
          is_partial_day: boolean
          kash_types: string
          manager_name: string
          manager_profile_id: string
          promoted_count: number
          promoted_pct: number
          reachable_count: number
          scannable_count: number
          total_active: number
        }[]
      }
      get_manager_silent_creators: {
        Args: { p_days?: number; p_tenant: string }
        Returns: {
          creator_id: string
          days_since_contact: number
          instagram_handle: string
          last_contact_at: string
          manager_name: string
          manager_profile_id: string
          name: string
        }[]
      }
      get_manager_silent_no_promo: {
        Args: { p_days?: number; p_low_promo_rate?: number; p_tenant: string }
        Returns: {
          creator_id: string
          days_since_contact: number
          instagram_handle: string
          last_contact_at: string
          manager_name: string
          manager_phone: string
          manager_profile_id: string
          mtd_day: number
          name: string
          promo_days: number
        }[]
      }
      get_project_by_share_token: {
        Args: { _token: string }
        Returns: {
          company_id: string | null
          created_at: string | null
          created_by: string
          description: string | null
          folder_id: string | null
          id: string
          leader_id: string | null
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
      get_promo_day_breakdown: {
        Args: { p_date?: string; p_manager_name?: string; p_tenant: string }
        Returns: {
          creadora: string
          creator_id: string
          cuentas: string
          handle: string
          manager_name: string
          networks: string
          promo_stories: number
        }[]
      }
      get_promo_day_faltantes: {
        Args: { p_date?: string; p_manager_name?: string; p_tenant: string }
        Returns: {
          creadora: string
          estado: string
          manager_name: string
        }[]
      }
      get_promo_month_comparison: {
        Args: {
          p_manager_name?: string
          p_months_back?: number
          p_tenant: string
        }
        Returns: {
          creator_id: string
          current_from: string
          current_to: string
          delta: number
          instagram_handle: string
          manager_name: string
          name: string
          prev_from: string
          prev_to: string
          promo_days_current: number
          promo_days_prev: number
          window_days: number
        }[]
      }
      get_promolog_action_feed: {
        Args: { p_tenant: string }
        Returns: {
          category: string
          creator_id: string
          instagram_handle: string
          kind: string
          name: string
          priority: number
          reason: string
        }[]
      }
      get_promolog_stale_creators: {
        Args: { p_days?: number }
        Returns: {
          creator_id: string
          days_empty: number
          handle: string
          name: string
        }[]
      }
      get_sub_pricing:
        | {
            Args: { p_days?: number; p_query?: string; p_tenant: string }
            Returns: Json
          }
        | {
            Args: {
              p_days?: number
              p_manager?: string
              p_query?: string
              p_tenant: string
            }
            Returns: Json
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
          task_type: string
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
          task_type: string
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
      get_tg_contact_ig: {
        Args: { p_conversation_id: string }
        Returns: string
      }
      get_unread_counts: {
        Args: { _user_id: string }
        Returns: {
          conversation_id: string
          unread_count: number
        }[]
      }
      get_wa_contact_ig: { Args: { p_contact_id: string }; Returns: string }
      get_wa_inbox_sla: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      has_chatter_evaluator_access: {
        Args: { _user_id: string }
        Returns: boolean
      }
      has_chatter_global_scope: { Args: { _user_id: string }; Returns: boolean }
      has_closer_global_scope: { Args: { _user_id: string }; Returns: boolean }
      has_company_qa_global_scope: {
        Args: { _user_id: string }
        Returns: boolean
      }
      has_contactos_global_scope: {
        Args: { _user_id: string }
        Returns: boolean
      }
      has_creators_global_scope: {
        Args: { _user_id: string }
        Returns: boolean
      }
      has_finanzas_access: { Args: { _user_id: string }; Returns: boolean }
      has_hr_access: { Args: { _user_id: string }; Returns: boolean }
      has_leadgen_global_scope: { Args: { _user_id: string }; Returns: boolean }
      has_permission: {
        Args: { _module: string; _submodule?: string; _user_id: string }
        Returns: boolean
      }
      has_qa_global_scope: { Args: { _user_id: string }; Returns: boolean }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | { Args: { _role: string; _user_id: string }; Returns: boolean }
      has_telefonos_global_scope: {
        Args: { _user_id: string }
        Returns: boolean
      }
      has_tg_inbox_global_scope: {
        Args: { _user_id: string }
        Returns: boolean
      }
      has_wa_inbox_global_scope: {
        Args: { _user_id: string }
        Returns: boolean
      }
      hubstaff_activity_summary: {
        Args: { p_from: string; p_person?: string; p_to: string }
        Returns: {
          avg_activity_pct: number
          days_worked: number
          hubstaff_role: string
          hubstaff_user_id: string
          last_day: string
          mapped_to_maven: boolean
          name: string
          profile_id: string
          total_hours: number
        }[]
      }
      hubstaff_can_write: { Args: never; Returns: boolean }
      hubstaff_entry_exit: {
        Args: { p_from: string; p_person?: string; p_to: string }
        Returns: {
          actividad_pct: number
          dia: string
          entrada: string
          horas: number
          name: string
          ultimo_ping: string
        }[]
      }
      hubstaff_live_today: {
        Args: { p_person?: string }
        Returns: {
          activity_pct: number
          feed_last_ping: string
          first_ping: string
          full_name_maven: string
          hours_today: number
          hubstaff_role: string
          hubstaff_user_id: string
          last_ping: string
          mapped_to_maven: boolean
          name: string
          seconds_today: number
        }[]
      }
      hubstaff_projects_by_member: {
        Args: { p_from: string; p_to: string }
        Returns: {
          hubstaff_user_id: string
          project_name: string
          tracked_seconds: number
        }[]
      }
      import_blu_chatter_daily: { Args: { p_rows: Json }; Returns: number }
      import_blu_chatters: {
        Args: { p_from: string; p_rows: Json; p_to: string }
        Returns: Json
      }
      import_blu_earnings: { Args: { p_rows: Json }; Returns: Json }
      import_blu_fan_retention: {
        Args: { p_from: string; p_rows: Json; p_to: string }
        Returns: Json
      }
      import_blu_fans: { Args: { p_rows: Json }; Returns: Json }
      import_blu_top_fans: {
        Args: {
          p_from: string
          p_period_kind?: string
          p_rows: Json
          p_to: string
        }
        Returns: Json
      }
      import_hubstaff_data: { Args: { p_rows: Json }; Returns: Json }
      import_hubstaff_members: { Args: { p_rows: Json }; Returns: Json }
      is_call_creator: {
        Args: { _call_id: string; _user_id: string }
        Returns: boolean
      }
      is_call_participant: {
        Args: { _call_id: string; _user_id: string }
        Returns: boolean
      }
      is_chat_admin: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_chat_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_conversation_creator: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_cowork_host: {
        Args: { _session_id: string; _user_id: string }
        Returns: boolean
      }
      is_cowork_member: {
        Args: { _session_id: string; _user_id: string }
        Returns: boolean
      }
      is_in_role_group: {
        Args: { _group: string; _user_id: string }
        Returns: boolean
      }
      is_phone_privileged: { Args: never; Returns: boolean }
      is_project_creator: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_tg_assignee: {
        Args: { p_conversation_id: string; p_uid: string }
        Returns: boolean
      }
      is_wa_assignee: {
        Args: { p_conversation_id: string; p_uid: string }
        Returns: boolean
      }
      last_sync_for: { Args: { p_table: string }; Returns: string }
      leadgen_agent_stats: {
        Args: { p_date_from?: string; p_date_to?: string }
        Returns: Json
      }
      leadgen_search_fuzzy: {
        Args: { p_limit?: number; p_min_similarity?: number; p_query: string }
        Returns: {
          city: string
          company: string
          country_code: string
          created_at: string
          id: string
          lg_user_id: string
          model_handle: string
          notes: string
          onlyfans_url: string
          phone_e164: string
          phone_raw: string
          platform: string
          similarity_score: number
          status: string
          ticket_number: string
        }[]
      }
      leadgen_summary_stats: {
        Args: { p_date_from?: string; p_date_to?: string; p_user_id?: string }
        Returns: Json
      }
      list_chatter_evaluators: {
        Args: never
        Returns: {
          avatar_url: string
          full_name: string
          user_id: string
        }[]
      }
      manager_promo_rolling14: { Args: { p_tenant: string }; Returns: Json }
      mask_email: { Args: { p: string }; Returns: string }
      mask_phone: { Args: { p: string }; Returns: string }
      metric_category_breakdown: {
        Args: { p_end: string; p_metric: string; p_start: string }
        Returns: {
          category: string
          count: number
        }[]
      }
      my_chatter_blu_employee_id: { Args: never; Returns: number }
      normalize_wa_e164: { Args: { raw: string }; Returns: string }
      operations_dashboard_kpis: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      pg_net_watchdog: { Args: never; Returns: string }
      pick_discovery_seeds: {
        Args: { p_total?: number }
        Returns: {
          out_handle: string
          out_signal_score: number
          out_source: string
        }[]
      }
      promo_creator_period_scores: {
        Args: { p_from: string; p_tenant?: string; p_to: string }
        Returns: {
          consistency_pts: number
          coverage_pct: number
          covered_days: number
          creator_id: string
          freq_pts: number
          instagram_handle: string
          is_partial: boolean
          lift_n_promo: number
          lift_n_quiet: number
          lift_pct: number
          manager_name: string
          manual_share: number
          name: string
          promo_days: number
          promo_networks: string
          quality_pts: number
          score: number
          target_networks: string[]
          window_days: number
        }[]
      }
      promolog_dispatched_today: {
        Args: { p_tenant_id: string }
        Returns: boolean
      }
      promolog_fallos_bloque: { Args: never; Returns: string }
      promolog_ig_scan_state_today: {
        Args: never
        Returns: {
          creator_id: string
          has_definitive: boolean
          source_handle: string
        }[]
      }
      promolog_upsert_handle_status: {
        Args: {
          p_creator_id: string
          p_days: number
          p_error: string
          p_handle: string
          p_status: string
        }
        Returns: undefined
      }
      purge_old_ai_conversations: { Args: never; Returns: undefined }
      reactivate_creator: {
        Args: { p_closer_responsible?: string; p_creator_id: string }
        Returns: {
          id: string
          rejoined_at: string
          status: string
        }[]
      }
      recalc_chatter_c1_puntualidad: {
        Args: {
          p_min_days?: number
          p_period: string
          p_tolerance_min?: number
        }
        Returns: Json
      }
      recalc_chatter_scorecard_hubstaff: {
        Args: { p_period: string }
        Returns: Json
      }
      recalculate_qa_call_participants: {
        Args: { p_call_id: string }
        Returns: undefined
      }
      recordar_horarios_pendientes: { Args: never; Returns: string }
      recover_stuck_spammer_scans: { Args: never; Returns: number }
      refresh_chatter_cost_config: {
        Args: { p_fx?: number }
        Returns: {
          base_salary_cop: number
          effective_agency_rate: number
          fx_cop_per_usd: number
          fx_updated_at: string | null
          id: boolean
          of_net_factor: number
          rate_updated_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "chatter_cost_config"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_wa_member: {
        Args: { p_group_id: string; p_name: string }
        Returns: {
          display_name: string
          full_name: string
          last_seen_at: string
          member_id: string
          member_role: string
          user_id: string
        }[]
      }
      resolve_wa_name:
        | {
            Args: { p_closer_creator_id: string; p_phone: string }
            Returns: {
              entity_id: string
              name: string
              source: string
            }[]
          }
        | {
            Args: { p_contact_id: string }
            Returns: {
              entity_id: string
              name: string
              source: string
            }[]
          }
      retry_pending_qa_report_emails: { Args: never; Returns: undefined }
      retry_stuck_qa_analyses: { Args: never; Returns: number }
      run_whatsapp_followup_tick: { Args: never; Returns: undefined }
      scouter_autopilot_state: {
        Args: never
        Returns: {
          active: boolean
          companies_filter: string[]
          last_tick_at: string
          paused_at: string
          paused_reason: string
        }[]
      }
      scouter_enqueue_autopilot_batch: {
        Args: { p_tenant_id: string }
        Returns: number
      }
      scouter_rank_leads_for_spammer: {
        Args: {
          p_batch_size?: number
          p_cooldown_days?: number
          p_spammer_id: string
          p_tenant_id: string
        }
        Returns: {
          ai_score: number
          bio: string
          country: string
          days_since_assigned: number
          followers: number
          id: string
          instagram_handle: string
          interaction_count: number
          rank_score: number
          status: string
        }[]
      }
      scouter_route_lead: {
        Args: { p_lead_id: string }
        Returns: {
          company_id: string
          company_slug: string
          method: string
          score: number
        }[]
      }
      scouter_top_seed_match: {
        Args: { p_lead_id: string }
        Returns: {
          seed_handle: string
          similarity: number
        }[]
      }
      search_creators_fuzzy: {
        Args: { p_q: string }
        Returns: {
          artistic_name: string
          id: string
          instagram_handle: string
          name: string
          status: string
        }[]
      }
      search_models: {
        Args: {
          p_city?: string
          p_country?: string
          p_has_onlyfans?: boolean
          p_has_phone?: boolean
          p_in_closers?: boolean
          p_in_leadgen?: boolean
          p_in_scouter?: boolean
          p_is_verified?: boolean
          p_limit?: number
          p_max_followers?: number
          p_min_followers?: number
          p_offset?: number
          p_order_by?: string
          p_phone?: string
          p_query?: string
          p_signed?: boolean
        }
        Returns: {
          avatar_url: string
          bio: string
          city: string
          country: string
          created_at: string
          display_name: string
          followers_count: number
          id: string
          instagram_handle: string
          is_in_closer_creators: boolean
          is_in_closers_contacts: boolean
          is_in_leadgen: boolean
          is_in_scouter: boolean
          is_signed: boolean
          is_verified: boolean
          last_scraped_at: string
          onlyfans_url: string
          primary_phone: string
          state: string
          tiktok_handle: string
          total_count: number
          total_phones: number
          twitter_handle: string
        }[]
      }
      set_creator_kash_type_by_blu: {
        Args: { p_blu_names: string[]; p_kash_type: string }
        Returns: number
      }
      set_creator_whatsapp: {
        Args: { p_creator_id: string; p_whatsapp: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      start_prospect_onboarding: {
        Args: { p_agency: string; p_prospect_id: string }
        Returns: string
      }
      sync_models_recent: {
        Args: { p_minutes?: number }
        Returns: {
          links_updated: number
          models_inserted: number
          models_updated: number
          phones_inserted: number
        }[]
      }
      tg_assign_conversation: {
        Args: { p_assignee: string; p_conversation_id: string }
        Returns: string
      }
      tg_bump_unread: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      tg_clear_conversation: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      tg_conversation_set_assignees: {
        Args: { p_conversation_id: string; p_user_ids: string[] }
        Returns: string
      }
      tg_delete_conversation: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      tg_mark_read: { Args: { p_conversation_id: string }; Returns: undefined }
      tg_set_conversation_flag: {
        Args: { p_conversation_id: string; p_flag: string; p_value: boolean }
        Returns: undefined
      }
      user_has_role_name: {
        Args: { _role_name: string; _user_id: string }
        Returns: boolean
      }
      user_has_tasks_in_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      wa_agent_lock_acquire: {
        Args: { p_group_id: string; p_holder: string; p_ttl_seconds: number }
        Returns: boolean
      }
      wa_agent_lock_release: {
        Args: { p_group_id: string; p_holder: string }
        Returns: undefined
      }
      wa_assign_conversation: {
        Args: { p_assignee: string; p_conversation_id: string }
        Returns: string
      }
      wa_bump_unread: {
        Args: {
          p_conversation_id: string
          p_preview: string
          p_sent_at: string
        }
        Returns: undefined
      }
      wa_can_view_channel: { Args: { _channel_id: string }; Returns: boolean }
      wa_clear_conversation: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      wa_conversation_set_assignees: {
        Args: { p_conversation_id: string; p_user_ids: string[] }
        Returns: string
      }
      wa_conversations_needing_summary: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          id: string
          last_message_at: string
          tenant_id: string
        }[]
      }
      wa_copilot_try_consume: {
        Args: { _user_id: string }
        Returns: {
          allowed: boolean
          lim: number
          used: number
        }[]
      }
      wa_delete_conversation: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      wa_inbox_can_see_all: { Args: never; Returns: boolean }
      wa_line_health: {
        Args: { p_hours?: number }
        Returns: {
          channel_id: string
          evolution_instance: string
          failed: number
          health: string
          label: string
          ok: number
          pct_fallo: number
          sent_pend: number
          total: number
        }[]
      }
      wa_mark_read: { Args: { p_conversation_id: string }; Returns: undefined }
      wa_set_contact_display_name: {
        Args: { p_contact_id: string; p_name: string }
        Returns: string
      }
      wa_set_conversation_flag: {
        Args: { p_conversation_id: string; p_flag: string; p_value: boolean }
        Returns: undefined
      }
      wa_supervises_department: {
        Args: { _dept: string; _user_id: string }
        Returns: boolean
      }
      whatsapp_bump_commitment_followup: {
        Args: { p_id: string }
        Returns: undefined
      }
      whatsapp_group_in_business_hours: {
        Args: { p_group_id: string }
        Returns: boolean
      }
      whatsapp_pending_reminders: {
        Args: { p_limit?: number }
        Returns: {
          attempt_count: number
          body: string
          commitment_id: string
          group_id: string
          id: string
          kind: string
          tenant_id: string
        }[]
      }
      whatsapp_resolve_user_by_lid: { Args: { p_lid: string }; Returns: string }
      whatsapp_resolve_user_by_phone: {
        Args: { p_jid_or_phone: string }
        Returns: string
      }
      whatsapp_resolve_user_by_push_name: {
        Args: { p_push_name: string }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "manager"
        | "employee"
        | "supervisor"
        | "agent"
        | "closer"
        | "spammer"
      mp_candidate_stage:
        | "candidata"
        | "contactada"
        | "entrevista"
        | "filtro"
        | "shooting"
        | "contrato"
        | "activa"
        | "inactiva"
      mp_content_source: "ai" | "modelo"
      mp_content_type:
        | "ai_social"
        | "ai_perfil"
        | "ai_premium"
        | "modelo_video"
        | "modelo_custom"
        | "modelo_intimo"
      mp_task_pillar:
        | "recruiting"
        | "ai"
        | "modelo"
        | "trafico"
        | "operaciones"
        | "general"
      mp_task_priority: "high" | "medium" | "low"
      mp_task_status: "todo" | "in_progress" | "blocked" | "completed"
      report_module: "llg" | "closers" | "chatters" | "combined"
      report_period: "daily" | "weekly" | "monthly" | "annual" | "quincenal"
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
      app_role: [
        "admin",
        "manager",
        "employee",
        "supervisor",
        "agent",
        "closer",
        "spammer",
      ],
      mp_candidate_stage: [
        "candidata",
        "contactada",
        "entrevista",
        "filtro",
        "shooting",
        "contrato",
        "activa",
        "inactiva",
      ],
      mp_content_source: ["ai", "modelo"],
      mp_content_type: [
        "ai_social",
        "ai_perfil",
        "ai_premium",
        "modelo_video",
        "modelo_custom",
        "modelo_intimo",
      ],
      mp_task_pillar: [
        "recruiting",
        "ai",
        "modelo",
        "trafico",
        "operaciones",
        "general",
      ],
      mp_task_priority: ["high", "medium", "low"],
      mp_task_status: ["todo", "in_progress", "blocked", "completed"],
      report_module: ["llg", "closers", "chatters", "combined"],
      report_period: ["daily", "weekly", "monthly", "annual", "quincenal"],
    },
  },
} as const
