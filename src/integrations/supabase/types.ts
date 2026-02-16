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
          artistic_name: string | null
          assigned_manager_id: string | null
          assigned_manager_profile_id: string | null
          assigned_specialist_id: string | null
          assigned_specialist_profile_id: string | null
          bio: string | null
          birth_date: string | null
          category: string | null
          chat_url: string | null
          city: string | null
          closer_responsible_id: string | null
          closer_responsible_profile_id: string | null
          country: string | null
          country_code: string | null
          created_at: string | null
          email: string | null
          external_transfer: number | null
          id: string
          instagram_followers: number | null
          instagram_handle: string | null
          internal_notes: string | null
          languages: string[] | null
          linkedin_handle: string | null
          name: string
          notes: string | null
          onlyfans_url: string | null
          phone: string | null
          phone_e164: string | null
          piclink_url: string | null
          profile_photo_url: string | null
          registration_date: string | null
          source: string | null
          status: string | null
          tiktok_handle: string | null
          twitter_handle: string | null
          updated_at: string | null
          whatsapp_number: string | null
          youtube_handle: string | null
        }
        Insert: {
          age?: number | null
          artistic_name?: string | null
          assigned_manager_id?: string | null
          assigned_manager_profile_id?: string | null
          assigned_specialist_id?: string | null
          assigned_specialist_profile_id?: string | null
          bio?: string | null
          birth_date?: string | null
          category?: string | null
          chat_url?: string | null
          city?: string | null
          closer_responsible_id?: string | null
          closer_responsible_profile_id?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          email?: string | null
          external_transfer?: number | null
          id?: string
          instagram_followers?: number | null
          instagram_handle?: string | null
          internal_notes?: string | null
          languages?: string[] | null
          linkedin_handle?: string | null
          name: string
          notes?: string | null
          onlyfans_url?: string | null
          phone?: string | null
          phone_e164?: string | null
          piclink_url?: string | null
          profile_photo_url?: string | null
          registration_date?: string | null
          source?: string | null
          status?: string | null
          tiktok_handle?: string | null
          twitter_handle?: string | null
          updated_at?: string | null
          whatsapp_number?: string | null
          youtube_handle?: string | null
        }
        Update: {
          age?: number | null
          artistic_name?: string | null
          assigned_manager_id?: string | null
          assigned_manager_profile_id?: string | null
          assigned_specialist_id?: string | null
          assigned_specialist_profile_id?: string | null
          bio?: string | null
          birth_date?: string | null
          category?: string | null
          chat_url?: string | null
          city?: string | null
          closer_responsible_id?: string | null
          closer_responsible_profile_id?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          email?: string | null
          external_transfer?: number | null
          id?: string
          instagram_followers?: number | null
          instagram_handle?: string | null
          internal_notes?: string | null
          languages?: string[] | null
          linkedin_handle?: string | null
          name?: string
          notes?: string | null
          onlyfans_url?: string | null
          phone?: string | null
          phone_e164?: string | null
          piclink_url?: string | null
          profile_photo_url?: string | null
          registration_date?: string | null
          source?: string | null
          status?: string | null
          tiktok_handle?: string | null
          twitter_handle?: string | null
          updated_at?: string | null
          whatsapp_number?: string | null
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
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      task_projects: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          name: string
          position: number
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
