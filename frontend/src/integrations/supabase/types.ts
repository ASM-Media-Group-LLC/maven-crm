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
          id: string
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string
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
          company_id: string | null
          completed_date: string | null
          confirmed_date: string | null
          created_at: string
          created_by: string | null
          estimated_monetization: number | null
          extras: number | null
          id: string
          instagram_handle: string
          last_contact_date: string | null
          leadgen_entry_id: string | null
          main_platform: string | null
          monthly_monetization: number | null
          notes: string | null
          onlyfans_url: string | null
          passed_date: string | null
          phone: string | null
          rejection_reason: string | null
          source_account: string | null
          source_contact_id: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          agency_commission?: number | null
          assigned_to?: string | null
          category?: string | null
          city?: string | null
          company_id?: string | null
          completed_date?: string | null
          confirmed_date?: string | null
          created_at?: string
          created_by?: string | null
          estimated_monetization?: number | null
          extras?: number | null
          id?: string
          instagram_handle: string
          last_contact_date?: string | null
          leadgen_entry_id?: string | null
          main_platform?: string | null
          monthly_monetization?: number | null
          notes?: string | null
          onlyfans_url?: string | null
          passed_date?: string | null
          phone?: string | null
          rejection_reason?: string | null
          source_account?: string | null
          source_contact_id?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          agency_commission?: number | null
          assigned_to?: string | null
          category?: string | null
          city?: string | null
          company_id?: string | null
          completed_date?: string | null
          confirmed_date?: string | null
          created_at?: string
          created_by?: string | null
          estimated_monetization?: number | null
          extras?: number | null
          id?: string
          instagram_handle?: string
          last_contact_date?: string | null
          leadgen_entry_id?: string | null
          main_platform?: string | null
          monthly_monetization?: number | null
          notes?: string | null
          onlyfans_url?: string | null
          passed_date?: string | null
          phone?: string | null
          rejection_reason?: string | null
          source_account?: string | null
          source_contact_id?: string | null
          stage?: string
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
            foreignKeyName: "closer_creators_source_contact_id_fkey"
            columns: ["source_contact_id"]
            isOneToOne: true
            referencedRelation: "closers_contacts"
            referencedColumns: ["id"]
          },
        ]
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
          country_code: string | null
          created_at: string | null
          created_by: string
          email: string | null
          handle: string
          id: string
          media_files: Json | null
          name: string
          notes: string | null
          onlyfans_url: string | null
          phone: string | null
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
          country_code?: string | null
          created_at?: string | null
          created_by: string
          email?: string | null
          handle: string
          id?: string
          media_files?: Json | null
          name: string
          notes?: string | null
          onlyfans_url?: string | null
          phone?: string | null
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
          country_code?: string | null
          created_at?: string | null
          created_by?: string
          email?: string | null
          handle?: string
          id?: string
          media_files?: Json | null
          name?: string
          notes?: string | null
          onlyfans_url?: string | null
          phone?: string | null
          physical_appearance?: string | null
          platform?: string
          profile_picture_url?: string | null
          record_type?: string
          source?: string | null
          status?: string | null
          ticket_number?: string | null
          updated_at?: string | null
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
          livekit_room_name: string
          name: string
          session_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          livekit_room_name: string
          name: string
          session_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          livekit_room_name?: string
          name?: string
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
          created_by: string | null
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
          facebook_handle: string | null
          reddit_handle: string | null
          other_url: string | null
          telegram_handle: string | null
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
          created_by?: string | null
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
          facebook_handle?: string | null
          reddit_handle?: string | null
          other_url?: string | null
          telegram_handle?: string | null
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
          created_by?: string | null
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
          facebook_handle?: string | null
          reddit_handle?: string | null
          other_url?: string | null
          telegram_handle?: string | null
        }
        Relationships: []
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
            foreignKeyName: "custom_content_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_content_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
        ]
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
      hubstaff_members: {
        Row: {
          created_at: string
          hubstaff_org_id: string | null
          hubstaff_user_id: string | null
          id: string
          is_active: boolean
          profile_id: string
        }
        Insert: {
          created_at?: string
          hubstaff_org_id?: string | null
          hubstaff_user_id?: string | null
          id?: string
          is_active?: boolean
          profile_id: string
        }
        Update: {
          created_at?: string
          hubstaff_org_id?: string | null
          hubstaff_user_id?: string | null
          id?: string
          is_active?: boolean
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hubstaff_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
          city: string | null
          company: string | null
          country_code: string | null
          created_at: string | null
          created_creator_id: string | null
          entry_date: string
          id: string
          lg_user_id: string
          model_handle: string
          notes: string | null
          onlyfans_url: string | null
          phone_e164: string | null
          phone_raw: string | null
          platform: string
          quality: string
          record_type: string
          source_link: string | null
          state: string | null
          status: string | null
          ticket_number: string | null
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          company?: string | null
          country_code?: string | null
          created_at?: string | null
          created_creator_id?: string | null
          entry_date?: string
          id?: string
          lg_user_id: string
          model_handle: string
          notes?: string | null
          onlyfans_url?: string | null
          phone_e164?: string | null
          phone_raw?: string | null
          platform: string
          quality?: string
          record_type?: string
          source_link?: string | null
          state?: string | null
          status?: string | null
          ticket_number?: string | null
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          company?: string | null
          country_code?: string | null
          created_at?: string | null
          created_creator_id?: string | null
          entry_date?: string
          id?: string
          lg_user_id?: string
          model_handle?: string
          notes?: string | null
          onlyfans_url?: string | null
          phone_e164?: string | null
          phone_raw?: string | null
          platform?: string
          quality?: string
          record_type?: string
          source_link?: string | null
          state?: string | null
          status?: string | null
          ticket_number?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
          created_by: string | null
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
          created_by?: string | null
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
          created_by?: string | null
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
      delete_conversation_cascade: {
        Args: { _conversation_id: string }
        Returns: undefined
      }
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
      get_closer_stage_counts: {
        Args: { _is_admin: boolean; _user_id: string }
        Returns: {
          cnt: number
          stage: string
        }[]
      }
      get_cowork_user_room: {
        Args: { _session_id: string; _user_id: string }
        Returns: string
      }
      get_distinct_promolog_agents: {
        Args: never
        Returns: {
          agent_id: string
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
      get_unread_counts: {
        Args: { _user_id: string }
        Returns: {
          conversation_id: string
          unread_count: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_call_creator: {
        Args: { _call_id: string; _user_id: string }
        Returns: boolean
      }
      is_call_participant: {
        Args: { _call_id: string; _user_id: string }
        Returns: boolean
      }
      is_chat_participant: {
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
      is_project_creator: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_role_name: {
        Args: { _role_name: string; _user_id: string }
        Returns: boolean
      }
      user_has_tasks_in_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
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
    },
  },
} as const
