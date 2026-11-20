export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          cancelled_at: string | null
          created_at: string
          hold_expires_at: string | null
          id: string
          late_cancel: boolean
          queued_at: string
          session_id: string
          status: Database["public"]["Enums"]["booking_status"]
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          hold_expires_at?: string | null
          id?: string
          late_cancel?: boolean
          queued_at?: string
          session_id: string
          status: Database["public"]["Enums"]["booking_status"]
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          hold_expires_at?: string | null
          id?: string
          late_cancel?: boolean
          queued_at?: string
          session_id?: string
          status?: Database["public"]["Enums"]["booking_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "session_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          joined_at: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          city: string
          created_at: string
          description: string
          esewa_id: string
          esewa_qr_path: string | null
          hold_minutes: number
          id: string
          invite_code: string
          is_public: boolean
          khalti_id: string
          khalti_qr_path: string | null
          name: string
          owner_id: string
          payment_mode: Database["public"]["Enums"]["payment_mode"]
          payment_note: string
        }
        Insert: {
          city?: string
          created_at?: string
          description?: string
          esewa_id?: string
          esewa_qr_path?: string | null
          hold_minutes?: number
          id?: string
          invite_code?: string
          is_public?: boolean
          khalti_id?: string
          khalti_qr_path?: string | null
          name: string
          owner_id?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"]
          payment_note?: string
        }
        Update: {
          city?: string
          created_at?: string
          description?: string
          esewa_id?: string
          esewa_qr_path?: string | null
          hold_minutes?: number
          id?: string
          invite_code?: string
          is_public?: boolean
          khalti_id?: string
          khalti_qr_path?: string | null
          name?: string
          owner_id?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"]
          payment_note?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_npr: number
          booking_id: string
          claimed_at: string | null
          created_at: string
          group_id: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          note: string
          proof_path: string | null
          reference: string
          reviewed_at: string | null
          reviewed_by: string | null
          session_id: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_npr: number
          booking_id: string
          claimed_at?: string | null
          created_at?: string
          group_id: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          note?: string
          proof_path?: string | null
          reference?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_npr?: number
          booking_id?: string
          claimed_at?: string | null
          created_at?: string
          group_id?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          note?: string
          proof_path?: string | null
          reference?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "session_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          dupr_id: string | null
          full_name: string
          id: string
          skill_level: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dupr_id?: string | null
          full_name?: string
          id: string
          skill_level?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dupr_id?: string | null
          full_name?: string
          id?: string
          skill_level?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          cancel_cutoff_hours: number
          capacity: number
          courts: number
          created_at: string
          created_by: string
          ends_at: string
          fee_npr: number
          group_id: string
          id: string
          location: string
          notes: string
          recurrence_id: string | null
          skill_max: number | null
          skill_min: number | null
          starts_at: string
          status: Database["public"]["Enums"]["session_status"]
          title: string
        }
        Insert: {
          cancel_cutoff_hours?: number
          capacity: number
          courts?: number
          created_at?: string
          created_by?: string
          ends_at: string
          fee_npr?: number
          group_id: string
          id?: string
          location?: string
          notes?: string
          recurrence_id?: string | null
          skill_max?: number | null
          skill_min?: number | null
          starts_at: string
          status?: Database["public"]["Enums"]["session_status"]
          title: string
        }
        Update: {
          cancel_cutoff_hours?: number
          capacity?: number
          courts?: number
          created_at?: string
          created_by?: string
          ends_at?: string
          fee_npr?: number
          group_id?: string
          id?: string
          location?: string
          notes?: string
          recurrence_id?: string | null
          skill_max?: number | null
          skill_min?: number | null
          starts_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      session_overview: {
        Row: {
          cancel_cutoff_hours: number | null
          capacity: number | null
          confirmed_count: number | null
          courts: number | null
          created_at: string | null
          created_by: string | null
          ends_at: string | null
          fee_npr: number | null
          group_id: string | null
          group_name: string | null
          id: string | null
          location: string | null
          my_status: Database["public"]["Enums"]["booking_status"] | null
          notes: string | null
          payment_mode: Database["public"]["Enums"]["payment_mode"] | null
          pending_count: number | null
          recurrence_id: string | null
          skill_max: number | null
          skill_min: number | null
          starts_at: string | null
          status: Database["public"]["Enums"]["session_status"] | null
          title: string | null
          waitlist_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      book_session: {
        Args: { session_id: string }
        Returns: Database["public"]["Enums"]["booking_status"]
      }
      cancel_booking: { Args: { session_id: string }; Returns: undefined }
      claim_payment: {
        Args: {
          method: Database["public"]["Enums"]["payment_method"]
          proof_path?: string
          reference?: string
          session_id: string
        }
        Returns: Database["public"]["Enums"]["payment_status"]
      }
      join_group: { Args: { code: string }; Returns: string }
      join_public_group: { Args: { group_id: string }; Returns: undefined }
      record_payment: {
        Args: {
          method: Database["public"]["Enums"]["payment_method"]
          note?: string
          session_id: string
          user_id: string
        }
        Returns: undefined
      }
      review_payment: {
        Args: { approve: boolean; note?: string; payment_id: string }
        Returns: Database["public"]["Enums"]["payment_status"]
      }
      void_payment: { Args: { payment_id: string }; Returns: undefined }
    }
    Enums: {
      booking_status:
        | "confirmed"
        | "waitlisted"
        | "cancelled"
        | "pending_payment"
      member_role: "organizer" | "member"
      payment_method: "cash" | "esewa" | "khalti" | "other"
      payment_mode: "pay_at_court" | "pay_to_confirm"
      payment_status: "claimed" | "confirmed" | "rejected"
      session_status: "scheduled" | "cancelled"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      booking_status: [
        "confirmed",
        "waitlisted",
        "cancelled",
        "pending_payment",
      ],
      member_role: ["organizer", "member"],
      payment_method: ["cash", "esewa", "khalti", "other"],
      payment_mode: ["pay_at_court", "pay_to_confirm"],
      payment_status: ["claimed", "confirmed", "rejected"],
      session_status: ["scheduled", "cancelled"],
    },
  },
} as const

