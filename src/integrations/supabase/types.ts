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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      integrations: {
        Row: {
          api_token: string | null
          config: Json | null
          created_at: string
          id: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_token?: string | null
          config?: Json | null
          created_at?: string
          id?: string
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_token?: string | null
          config?: Json | null
          created_at?: string
          id?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nudge_followups: {
        Row: {
          assignee: string | null
          channel_id: string
          created_at: string
          external_task_id: string | null
          external_task_url: string | null
          followup_at: string
          id: string
          processed_message_id: string
          slack_message_ts: string
          status: string
          task_summary: string
          urgency: string
          user_id: string | null
        }
        Insert: {
          assignee?: string | null
          channel_id: string
          created_at?: string
          external_task_id?: string | null
          external_task_url?: string | null
          followup_at: string
          id?: string
          processed_message_id: string
          slack_message_ts: string
          status?: string
          task_summary: string
          urgency?: string
          user_id?: string | null
        }
        Update: {
          assignee?: string | null
          channel_id?: string
          created_at?: string
          external_task_id?: string | null
          external_task_url?: string | null
          followup_at?: string
          id?: string
          processed_message_id?: string
          slack_message_ts?: string
          status?: string
          task_summary?: string
          urgency?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nudge_followups_processed_message_id_fkey"
            columns: ["processed_message_id"]
            isOneToOne: false
            referencedRelation: "slack_processed_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      open_loops: {
        Row: {
          ai_draft_response: string
          channel: string
          created_at: string
          dismissed: boolean
          due_date: string
          employee_name: string
          id: string
          nudge_sent: boolean
          original_message: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ai_draft_response: string
          channel?: string
          created_at?: string
          dismissed?: boolean
          due_date: string
          employee_name: string
          id?: string
          nudge_sent?: boolean
          original_message: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ai_draft_response?: string
          channel?: string
          created_at?: string
          dismissed?: boolean
          due_date?: string
          employee_name?: string
          id?: string
          nudge_sent?: boolean
          original_message?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_channel_id: string | null
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_channel_id?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_channel_id?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      slack_processed_messages: {
        Row: {
          ai_nudge_draft: string | null
          assignee: string | null
          channel_id: string
          created_at: string
          deadline: string | null
          external_task_id: string | null
          external_task_url: string | null
          id: string
          is_actionable: boolean
          nudge_sent: boolean
          nudge_sent_at: string | null
          slack_message_ts: string
          task_summary: string | null
          trigger_message: string | null
          updated_at: string
          urgency: string
          user_id: string | null
        }
        Insert: {
          ai_nudge_draft?: string | null
          assignee?: string | null
          channel_id: string
          created_at?: string
          deadline?: string | null
          external_task_id?: string | null
          external_task_url?: string | null
          id?: string
          is_actionable?: boolean
          nudge_sent?: boolean
          nudge_sent_at?: string | null
          slack_message_ts: string
          task_summary?: string | null
          trigger_message?: string | null
          updated_at?: string
          urgency?: string
          user_id?: string | null
        }
        Update: {
          ai_nudge_draft?: string | null
          assignee?: string | null
          channel_id?: string
          created_at?: string
          deadline?: string | null
          external_task_id?: string | null
          external_task_url?: string | null
          id?: string
          is_actionable?: boolean
          nudge_sent?: boolean
          nudge_sent_at?: string | null
          slack_message_ts?: string
          task_summary?: string | null
          trigger_message?: string | null
          updated_at?: string
          urgency?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
