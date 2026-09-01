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
      account_role_map: {
        Row: {
          account_id: string
          created_at: string
          organization_id: string
          role: Database["public"]["Enums"]["ledger_account_role"]
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          organization_id?: string
          role: Database["public"]["Enums"]["ledger_account_role"]
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["ledger_account_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_role_map_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_role_map_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          changed_at: string
          changed_by: string | null
          changed_by_customer_id: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          organization_id: string
          record_id: string
          table_name: string
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          changed_at?: string
          changed_by?: string | null
          changed_by_customer_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          organization_id: string
          record_id: string
          table_name: string
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          changed_at?: string
          changed_by?: string | null
          changed_by_customer_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          organization_id?: string
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_changed_by_customer_id_fkey"
            columns: ["changed_by_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          declared_closing_cash: number | null
          expected_cash: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_cash: number
          organization_id: string
          status: Database["public"]["Enums"]["cash_session_status"]
          store_id: string
          terminal_id: string
          updated_at: string
          variance: number | null
          variance_reason: string | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          declared_closing_cash?: number | null
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_cash: number
          organization_id?: string
          status?: Database["public"]["Enums"]["cash_session_status"]
          store_id: string
          terminal_id: string
          updated_at?: string
          variance?: number | null
          variance_reason?: string | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          declared_closing_cash?: number | null
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_cash?: number
          organization_id?: string
          status?: Database["public"]["Enums"]["cash_session_status"]
          store_id?: string
          terminal_id?: string
          updated_at?: string
          variance?: number | null
          variance_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "pos_terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          account_code: string
          account_name: string
          account_type: Database["public"]["Enums"]["account_type"]
          control_type: Database["public"]["Enums"]["control_account_type"]
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          normal_balance: Database["public"]["Enums"]["balance_side"]
          organization_id: string
          parent_account_id: string | null
          updated_at: string
        }
        Insert: {
          account_code: string
          account_name: string
          account_type: Database["public"]["Enums"]["account_type"]
          control_type?: Database["public"]["Enums"]["control_account_type"]
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          normal_balance: Database["public"]["Enums"]["balance_side"]
          organization_id?: string
          parent_account_id?: string | null
          updated_at?: string
        }
        Update: {
          account_code?: string
          account_name?: string
          account_type?: Database["public"]["Enums"]["account_type"]
          control_type?: Database["public"]["Enums"]["control_account_type"]
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          normal_balance?: Database["public"]["Enums"]["balance_side"]
          organization_id?: string
          parent_account_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          city: string
          country: string
          created_at: string
          customer_id: string
          id: string
          is_default: boolean
          label: string | null
          line1: string
          line2: string | null
          organization_id: string
          phone: string
          postal_code: string
          recipient_name: string
          state: string
          updated_at: string
        }
        Insert: {
          city: string
          country?: string
          created_at?: string
          customer_id: string
          id?: string
          is_default?: boolean
          label?: string | null
          line1: string
          line2?: string | null
          organization_id: string
          phone: string
          postal_code: string
          recipient_name: string
          state: string
          updated_at?: string
        }
        Update: {
          city?: string
          country?: string
          created_at?: string
          customer_id?: string
          id?: string
          is_default?: boolean
          label?: string | null
          line1?: string
          line2?: string | null
          organization_id?: string
          phone?: string
          postal_code?: string
          recipient_name?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_addresses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_receipts: {
        Row: {
          amount: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          customer_id: string
          id: string
          journal_entry_id: string | null
          notes: string | null
          organization_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          posted_at: string
          posted_by: string
          receipt_date: string
          receipt_number: string
          reference_number: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          store_id: string
        }
        Insert: {
          amount: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          customer_id: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          organization_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          posted_at?: string
          posted_by?: string
          receipt_date?: string
          receipt_number: string
          reference_number?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          store_id: string
        }
        Update: {
          amount?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          organization_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          posted_at?: string
          posted_by?: string
          receipt_date?: string
          receipt_number?: string
          reference_number?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_receipts_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          auth_user_id: string | null
          billing_address: string | null
          created_at: string
          created_by: string
          customer_code: string
          email: string | null
          gstin: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          billing_address?: string | null
          created_at?: string
          created_by?: string
          customer_code: string
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          billing_address?: string | null
          created_at?: string
          created_by?: string
          customer_code?: string
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_sequences: {
        Row: {
          current_value: number
          id: string
          organization_id: string
          prefix: string
          sequence_type: Database["public"]["Enums"]["document_sequence_type"]
          store_id: string
          updated_at: string
        }
        Insert: {
          current_value?: number
          id?: string
          organization_id?: string
          prefix?: string
          sequence_type: Database["public"]["Enums"]["document_sequence_type"]
          store_id: string
          updated_at?: string
        }
        Update: {
          current_value?: number
          id?: string
          organization_id?: string
          prefix?: string
          sequence_type?: Database["public"]["Enums"]["document_sequence_type"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_sequences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_sequences_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_store_access: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          store_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          store_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_store_access_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_store_access_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      item_store_costs: {
        Row: {
          item_id: string
          organization_id: string
          store_id: string
          total_value: number
          updated_at: string
        }
        Insert: {
          item_id: string
          organization_id?: string
          store_id: string
          total_value?: number
          updated_at?: string
        }
        Update: {
          item_id?: string
          organization_id?: string
          store_id?: string
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_store_costs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_store_costs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_store_costs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          barcode: string | null
          category_id: string | null
          cost_price: number
          created_at: string
          created_by: string
          description: string | null
          hsn_code: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          reorder_level: number
          selling_price: number
          sku: string
          tax_rate_percent: number
          track_inventory: boolean
          uom_id: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          created_by?: string
          description?: string | null
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id?: string
          reorder_level?: number
          selling_price?: number
          sku: string
          tax_rate_percent?: number
          track_inventory?: boolean
          uom_id: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          created_by?: string
          description?: string | null
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          reorder_level?: number
          selling_price?: number
          sku?: string
          tax_rate_percent?: number
          track_inventory?: boolean
          uom_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: false
            referencedRelation: "units_of_measurement"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          entry_date: string
          id: string
          organization_id: string
          reference: string | null
          source_id: string | null
          source_type: Database["public"]["Enums"]["journal_source_type"]
          store_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          description?: string | null
          entry_date?: string
          id?: string
          organization_id?: string
          reference?: string | null
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["journal_source_type"]
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          entry_date?: string
          id?: string
          organization_id?: string
          reference?: string | null
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["journal_source_type"]
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          customer_id: string | null
          debit: number
          description: string | null
          id: string
          journal_entry_id: string
          supplier_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          customer_id?: string | null
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id: string
          supplier_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          customer_id?: string | null
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id?: string
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_accounts: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          organization_id: string
          status: Database["public"]["Enums"]["loyalty_account_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["loyalty_account_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["loyalty_account_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_programs: {
        Row: {
          active: boolean
          created_at: string
          earn_amount: number
          earn_points: number
          id: string
          maximum_redemption_percentage: number
          minimum_redemption_points: number
          name: string
          organization_id: string
          points_expiry_days: number | null
          redemption_points: number
          redemption_value: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          earn_amount?: number
          earn_points?: number
          id?: string
          maximum_redemption_percentage?: number
          minimum_redemption_points?: number
          name: string
          organization_id?: string
          points_expiry_days?: number | null
          redemption_points?: number
          redemption_value?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          earn_amount?: number
          earn_points?: number
          id?: string
          maximum_redemption_percentage?: number
          minimum_redemption_points?: number
          name?: string
          organization_id?: string
          points_expiry_days?: number | null
          redemption_points?: number
          redemption_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_programs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          loyalty_account_id: string
          organization_id: string
          points: number
          reason: string | null
          reference_transaction_id: string | null
          source_id: string | null
          source_type: string
          transaction_type: Database["public"]["Enums"]["loyalty_transaction_type"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          loyalty_account_id: string
          organization_id?: string
          points: number
          reason?: string | null
          reference_transaction_id?: string | null
          source_id?: string | null
          source_type: string
          transaction_type: Database["public"]["Enums"]["loyalty_transaction_type"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          loyalty_account_id?: string
          organization_id?: string
          points?: number
          reason?: string | null
          reference_transaction_id?: string | null
          source_id?: string | null
          source_type?: string
          transaction_type?: Database["public"]["Enums"]["loyalty_transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_loyalty_account_id_fkey"
            columns: ["loyalty_account_id"]
            isOneToOne: false
            referencedRelation: "loyalty_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_loyalty_account_id_fkey"
            columns: ["loyalty_account_id"]
            isOneToOne: false
            referencedRelation: "loyalty_balances"
            referencedColumns: ["loyalty_account_id"]
          },
          {
            foreignKeyName: "loyalty_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_reference_transaction_id_fkey"
            columns: ["reference_transaction_id"]
            isOneToOne: false
            referencedRelation: "loyalty_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      online_order_lines: {
        Row: {
          created_at: string
          discount_amount: number
          id: string
          item_id: string
          item_name_snapshot: string
          line_total: number
          order_id: string
          organization_id: string
          quantity: number
          tax_amount: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          id?: string
          item_id: string
          item_name_snapshot: string
          line_total: number
          order_id: string
          organization_id: string
          quantity: number
          tax_amount?: number
          unit_price: number
        }
        Update: {
          created_at?: string
          discount_amount?: number
          id?: string
          item_id?: string
          item_name_snapshot?: string
          line_total?: number
          order_id?: string
          organization_id?: string
          quantity?: number
          tax_amount?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "online_order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      online_orders: {
        Row: {
          billing_address_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          channel: string
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          delivered_at: string | null
          discount_total: number
          fulfillment_store_id: string | null
          grand_total: number
          id: string
          idempotency_key: string | null
          loyalty_points_earned: number
          loyalty_points_redeemed: number
          order_number: string
          organization_id: string
          packed_at: string | null
          payment_status: string
          placed_at: string
          processing_at: string | null
          sale_id: string | null
          shipping_address_id: string
          shipping_total: number
          status: string
          store_assigned_at: string | null
          subtotal: number
          tax_total: number
          updated_at: string
        }
        Insert: {
          billing_address_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          channel?: string
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          delivered_at?: string | null
          discount_total?: number
          fulfillment_store_id?: string | null
          grand_total: number
          id?: string
          idempotency_key?: string | null
          loyalty_points_earned?: number
          loyalty_points_redeemed?: number
          order_number: string
          organization_id: string
          packed_at?: string | null
          payment_status?: string
          placed_at?: string
          processing_at?: string | null
          sale_id?: string | null
          shipping_address_id: string
          shipping_total?: number
          status?: string
          store_assigned_at?: string | null
          subtotal: number
          tax_total: number
          updated_at?: string
        }
        Update: {
          billing_address_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          channel?: string
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          delivered_at?: string | null
          discount_total?: number
          fulfillment_store_id?: string | null
          grand_total?: number
          id?: string
          idempotency_key?: string | null
          loyalty_points_earned?: number
          loyalty_points_redeemed?: number
          order_number?: string
          organization_id?: string
          packed_at?: string | null
          payment_status?: string
          placed_at?: string
          processing_at?: string | null
          sale_id?: string | null
          shipping_address_id?: string
          shipping_total?: number
          status?: string
          store_assigned_at?: string | null
          subtotal?: number
          tax_total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "online_orders_billing_address_id_fkey"
            columns: ["billing_address_id"]
            isOneToOne: false
            referencedRelation: "customer_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_orders_fulfillment_store_id_fkey"
            columns: ["fulfillment_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_orders_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sale_profitability"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "online_orders_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_orders_shipping_address_id_fkey"
            columns: ["shipping_address_id"]
            isOneToOne: false
            referencedRelation: "customer_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          gstin: string | null
          id: string
          is_public_storefront: boolean
          legal_name: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          gstin?: string | null
          id?: string
          is_public_storefront?: boolean
          legal_name?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          gstin?: string | null
          id?: string
          is_public_storefront?: boolean
          legal_name?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          organization_id: string
          payment_intent_id: string
          processed_at: string | null
          provider: string
          provider_event_id: string
          raw_payload: Json
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          organization_id: string
          payment_intent_id: string
          processed_at?: string | null
          provider: string
          provider_event_id: string
          raw_payload: Json
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          organization_id?: string
          payment_intent_id?: string
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          raw_payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_intents: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          order_id: string
          organization_id: string
          provider: string
          provider_intent_id: string | null
          provider_payment_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          order_id: string
          organization_id: string
          provider: string
          provider_intent_id?: string | null
          provider_payment_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          order_id?: string
          organization_id?: string
          provider?: string
          provider_intent_id?: string | null
          provider_payment_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_terminals: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          store_id: string
          terminal_code: string
          terminal_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          store_id: string
          terminal_code: string
          terminal_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          store_id?: string
          terminal_code?: string
          terminal_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_terminals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_terminals_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          parent_category_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id?: string
          parent_category_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          parent_category_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_media: {
        Row: {
          alt_text: string | null
          created_at: string
          created_by: string
          id: string
          is_primary: boolean
          item_id: string
          media_type: string
          organization_id: string
          sort_order: number
          storage_path: string
          updated_at: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_primary?: boolean
          item_id: string
          media_type?: string
          organization_id?: string
          sort_order?: number
          storage_path: string
          updated_at?: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_primary?: boolean
          item_id?: string
          media_type?: string
          organization_id?: string
          sort_order?: number
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_media_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_media_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_media_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          organization_id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          organization_id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_lines: {
        Row: {
          created_at: string
          discount_amount: number
          id: string
          item_id: string
          line_no: number
          line_total: number | null
          purchase_id: string
          purchase_rate: number
          quantity: number
          tax_amount: number
          uom_id: string
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          id?: string
          item_id: string
          line_no: number
          line_total?: number | null
          purchase_id: string
          purchase_rate: number
          quantity: number
          tax_amount?: number
          uom_id: string
        }
        Update: {
          created_at?: string
          discount_amount?: number
          id?: string
          item_id?: string
          line_no?: number
          line_total?: number | null
          purchase_id?: string
          purchase_rate?: number
          quantity?: number
          tax_amount?: number
          uom_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: false
            referencedRelation: "units_of_measurement"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_return_lines: {
        Row: {
          created_at: string
          discount_amount: number
          id: string
          item_id: string
          line_no: number
          line_total: number | null
          original_purchase_line_id: string
          purchase_rate: number
          purchase_return_id: string
          quantity: number
          tax_amount: number
          uom_id: string
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          id?: string
          item_id: string
          line_no: number
          line_total?: number | null
          original_purchase_line_id: string
          purchase_rate: number
          purchase_return_id: string
          quantity: number
          tax_amount?: number
          uom_id: string
        }
        Update: {
          created_at?: string
          discount_amount?: number
          id?: string
          item_id?: string
          line_no?: number
          line_total?: number | null
          original_purchase_line_id?: string
          purchase_rate?: number
          purchase_return_id?: string
          quantity?: number
          tax_amount?: number
          uom_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_return_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_lines_original_purchase_line_id_fkey"
            columns: ["original_purchase_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_lines_purchase_return_id_fkey"
            columns: ["purchase_return_id"]
            isOneToOne: false
            referencedRelation: "purchase_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_lines_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: false
            referencedRelation: "units_of_measurement"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_returns: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          discount_amount: number
          id: string
          journal_entry_id: string | null
          notes: string | null
          organization_id: string
          original_purchase_id: string
          posted_at: string | null
          posted_by: string | null
          return_date: string
          return_number: string
          status: Database["public"]["Enums"]["transaction_status"]
          store_id: string
          subtotal: number
          supplier_id: string
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          discount_amount?: number
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          organization_id?: string
          original_purchase_id: string
          posted_at?: string | null
          posted_by?: string | null
          return_date?: string
          return_number: string
          status?: Database["public"]["Enums"]["transaction_status"]
          store_id: string
          subtotal?: number
          supplier_id: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          discount_amount?: number
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          organization_id?: string
          original_purchase_id?: string
          posted_at?: string | null
          posted_by?: string | null
          return_date?: string
          return_number?: string
          status?: Database["public"]["Enums"]["transaction_status"]
          store_id?: string
          subtotal?: number
          supplier_id?: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_returns_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_original_purchase_id_fkey"
            columns: ["original_purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          discount_amount: number
          document_date: string
          document_number: string
          id: string
          journal_entry_id: string | null
          notes: string | null
          organization_id: string
          posted_at: string | null
          posted_by: string | null
          reference_number: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          store_id: string
          subtotal: number
          supplier_id: string
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          discount_amount?: number
          document_date?: string
          document_number: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          organization_id?: string
          posted_at?: string | null
          posted_by?: string | null
          reference_number?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          store_id: string
          subtotal?: number
          supplier_id: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          discount_amount?: number
          document_date?: string
          document_number?: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          organization_id?: string
          posted_at?: string | null
          posted_by?: string | null
          reference_number?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          store_id?: string
          subtotal?: number
          supplier_id?: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_line_movements: {
        Row: {
          created_at: string
          movement_id: string
          sale_line_id: string
        }
        Insert: {
          created_at?: string
          movement_id: string
          sale_line_id: string
        }
        Update: {
          created_at?: string
          movement_id?: string
          sale_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_line_movements_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_line_movements_sale_line_id_fkey"
            columns: ["sale_line_id"]
            isOneToOne: true
            referencedRelation: "sale_line_cogs"
            referencedColumns: ["sale_line_id"]
          },
          {
            foreignKeyName: "sale_line_movements_sale_line_id_fkey"
            columns: ["sale_line_id"]
            isOneToOne: true
            referencedRelation: "sale_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_lines: {
        Row: {
          created_at: string
          discount_amount: number
          id: string
          item_id: string
          line_no: number
          line_total: number | null
          quantity: number
          sale_id: string
          selling_rate: number
          tax_amount: number
          uom_id: string
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          id?: string
          item_id: string
          line_no: number
          line_total?: number | null
          quantity: number
          sale_id: string
          selling_rate: number
          tax_amount?: number
          uom_id: string
        }
        Update: {
          created_at?: string
          discount_amount?: number
          id?: string
          item_id?: string
          line_no?: number
          line_total?: number | null
          quantity?: number
          sale_id?: string
          selling_rate?: number
          tax_amount?: number
          uom_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_lines_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sale_profitability"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sale_lines_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_lines_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: false
            referencedRelation: "units_of_measurement"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount_paid: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          customer_id: string | null
          customer_name: string | null
          discount_amount: number
          id: string
          invoice_date: string
          invoice_number: string
          journal_entry_id: string | null
          loyalty_points_redeemed: number
          notes: string | null
          organization_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          posted_at: string | null
          posted_by: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          store_id: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          customer_name?: string | null
          discount_amount?: number
          id?: string
          invoice_date?: string
          invoice_number: string
          journal_entry_id?: string | null
          loyalty_points_redeemed?: number
          notes?: string | null
          organization_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          posted_at?: string | null
          posted_by?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          store_id: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          customer_name?: string | null
          discount_amount?: number
          id?: string
          invoice_date?: string
          invoice_number?: string
          journal_entry_id?: string | null
          loyalty_points_redeemed?: number
          notes?: string | null
          organization_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          posted_at?: string | null
          posted_by?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          store_id?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_return_lines: {
        Row: {
          created_at: string
          discount_amount: number
          id: string
          item_id: string
          line_no: number
          line_total: number | null
          original_sale_line_id: string
          quantity: number
          sales_return_id: string
          selling_rate: number
          tax_amount: number
          uom_id: string
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          id?: string
          item_id: string
          line_no: number
          line_total?: number | null
          original_sale_line_id: string
          quantity: number
          sales_return_id: string
          selling_rate: number
          tax_amount?: number
          uom_id: string
        }
        Update: {
          created_at?: string
          discount_amount?: number
          id?: string
          item_id?: string
          line_no?: number
          line_total?: number | null
          original_sale_line_id?: string
          quantity?: number
          sales_return_id?: string
          selling_rate?: number
          tax_amount?: number
          uom_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_return_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_lines_original_sale_line_id_fkey"
            columns: ["original_sale_line_id"]
            isOneToOne: false
            referencedRelation: "sale_line_cogs"
            referencedColumns: ["sale_line_id"]
          },
          {
            foreignKeyName: "sales_return_lines_original_sale_line_id_fkey"
            columns: ["original_sale_line_id"]
            isOneToOne: false
            referencedRelation: "sale_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_lines_sales_return_id_fkey"
            columns: ["sales_return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_lines_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: false
            referencedRelation: "units_of_measurement"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_returns: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          customer_id: string | null
          discount_amount: number
          id: string
          journal_entry_id: string | null
          notes: string | null
          organization_id: string
          original_sale_id: string
          posted_at: string | null
          posted_by: string | null
          return_date: string
          return_number: string
          status: Database["public"]["Enums"]["transaction_status"]
          store_id: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          discount_amount?: number
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          organization_id?: string
          original_sale_id: string
          posted_at?: string | null
          posted_by?: string | null
          return_date?: string
          return_number: string
          status?: Database["public"]["Enums"]["transaction_status"]
          store_id: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          discount_amount?: number
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          organization_id?: string
          original_sale_id?: string
          posted_at?: string | null
          posted_by?: string | null
          return_date?: string
          return_number?: string
          status?: Database["public"]["Enums"]["transaction_status"]
          store_id?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_returns_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_original_sale_id_fkey"
            columns: ["original_sale_id"]
            isOneToOne: false
            referencedRelation: "sale_profitability"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sales_returns_original_sale_id_fkey"
            columns: ["original_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movement_costs: {
        Row: {
          adjustment_reason:
            | Database["public"]["Enums"]["stock_adjustment_reason"]
            | null
          cost_basis: Database["public"]["Enums"]["cost_basis_source"]
          created_at: string
          movement_id: string
          organization_id: string
          source_movement_id: string | null
          total_cost: number
          unit_cost: number
        }
        Insert: {
          adjustment_reason?:
            | Database["public"]["Enums"]["stock_adjustment_reason"]
            | null
          cost_basis: Database["public"]["Enums"]["cost_basis_source"]
          created_at?: string
          movement_id: string
          organization_id?: string
          source_movement_id?: string | null
          total_cost: number
          unit_cost: number
        }
        Update: {
          adjustment_reason?:
            | Database["public"]["Enums"]["stock_adjustment_reason"]
            | null
          cost_basis?: Database["public"]["Enums"]["cost_basis_source"]
          created_at?: string
          movement_id?: string
          organization_id?: string
          source_movement_id?: string | null
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_movement_costs_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: true
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movement_costs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movement_costs_source_movement_id_fkey"
            columns: ["source_movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string
          direction: Database["public"]["Enums"]["stock_direction"]
          id: string
          item_id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          notes: string | null
          organization_id: string
          quantity: number
          reference: string | null
          store_id: string
          transaction_date: string
          transfer_group_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          direction: Database["public"]["Enums"]["stock_direction"]
          id?: string
          item_id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          notes?: string | null
          organization_id?: string
          quantity: number
          reference?: string | null
          store_id: string
          transaction_date?: string
          transfer_group_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          direction?: Database["public"]["Enums"]["stock_direction"]
          id?: string
          item_id?: string
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          notes?: string | null
          organization_id?: string
          quantity?: number
          reference?: string | null
          store_id?: string
          transaction_date?: string
          transfer_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_reservations: {
        Row: {
          consumed_at: string | null
          created_at: string
          id: string
          item_id: string
          online_order_id: string
          online_order_line_id: string
          organization_id: string
          quantity: number
          released_at: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          id?: string
          item_id: string
          online_order_id: string
          online_order_line_id: string
          organization_id: string
          quantity: number
          released_at?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          id?: string
          item_id?: string
          online_order_id?: string
          online_order_line_id?: string
          organization_id?: string
          quantity?: number
          released_at?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_reservations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_online_order_id_fkey"
            columns: ["online_order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_online_order_line_id_fkey"
            columns: ["online_order_line_id"]
            isOneToOne: false
            referencedRelation: "online_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_shipping_config: {
        Row: {
          active: boolean
          created_at: string
          id: string
          organization_id: string
          provider: string
          provider_location_id: string | null
          provider_location_name: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          organization_id: string
          provider: string
          provider_location_id?: string | null
          provider_location_name?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          organization_id?: string
          provider?: string
          provider_location_id?: string | null
          provider_location_name?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_shipping_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_shipping_config_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          phone: string | null
          store_code: string
          store_name: string
          type: Database["public"]["Enums"]["store_type"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          phone?: string | null
          store_code: string
          store_name: string
          type?: Database["public"]["Enums"]["store_type"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          phone?: string | null
          store_code?: string
          store_name?: string
          type?: Database["public"]["Enums"]["store_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          id: string
          journal_entry_id: string | null
          notes: string | null
          organization_id: string
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_number: string
          posted_at: string
          posted_by: string
          reference_number: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          store_id: string
          supplier_id: string
        }
        Insert: {
          amount: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          organization_id?: string
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_number: string
          posted_at?: string
          posted_by?: string
          reference_number?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          store_id: string
          supplier_id: string
        }
        Update: {
          amount?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          organization_id?: string
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_number?: string
          posted_at?: string
          posted_by?: string
          reference_number?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          store_id?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          billing_address: string | null
          created_at: string
          created_by: string
          email: string | null
          gstin: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          phone: string | null
          supplier_code: string
          updated_at: string
        }
        Insert: {
          billing_address?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id?: string
          phone?: string | null
          supplier_code: string
          updated_at?: string
        }
        Update: {
          billing_address?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          phone?: string | null
          supplier_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      units_of_measurement: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_of_measurement_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      available_to_sell: {
        Row: {
          available_quantity: number | null
          item_id: string | null
          organization_id: string | null
          quantity_on_hand: number | null
          reserved_quantity: number | null
          store_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_valuation: {
        Row: {
          average_cost: number | null
          item_id: string | null
          organization_id: string | null
          quantity_on_hand: number | null
          store_id: string | null
          total_value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_balances: {
        Row: {
          customer_id: string | null
          lifetime_earned: number | null
          lifetime_redeemed: number | null
          loyalty_account_id: string | null
          organization_id: string | null
          points_balance: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_line_cogs: {
        Row: {
          cogs: number | null
          sale_id: string | null
          sale_line_id: string | null
          unit_cost: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_lines_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sale_profitability"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sale_lines_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_profitability: {
        Row: {
          cogs: number | null
          gross_margin_percent: number | null
          gross_profit: number | null
          invoice_date: string | null
          invoice_number: string | null
          organization_id: string | null
          revenue: number | null
          sale_id: string | null
          store_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_balances: {
        Row: {
          item_id: string | null
          organization_id: string | null
          quantity_on_hand: number | null
          store_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adjust_customer_points: {
        Args: { p_customer_id: string; p_points: number; p_reason: string }
        Returns: string
      }
      advance_online_order_status: {
        Args: { p_new_status: string; p_order_id: string }
        Returns: undefined
      }
      assert_stock_available: {
        Args: {
          p_item_id: string
          p_quantity_needed: number
          p_store_id: string
        }
        Returns: undefined
      }
      assign_online_order_store: {
        Args: { p_order_id: string; p_store_id: string }
        Returns: undefined
      }
      auto_allocate_online_order_store: {
        Args: { p_order_id: string }
        Returns: string
      }
      cancel_customer_receipt: {
        Args: { p_reason: string; p_receipt_id: string }
        Returns: string
      }
      cancel_online_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: undefined
      }
      cancel_supplier_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: string
      }
      claim_customer_identity: { Args: never; Returns: string }
      close_cash_session: {
        Args: {
          p_declared_closing_cash: number
          p_session_id: string
          p_variance_reason?: string
        }
        Returns: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          declared_closing_cash: number | null
          expected_cash: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_cash: number
          organization_id: string
          status: Database["public"]["Enums"]["cash_session_status"]
          store_id: string
          terminal_id: string
          updated_at: string
          variance: number | null
          variance_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "cash_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      control_type_for_payment_method: {
        Args: { p_method: Database["public"]["Enums"]["payment_method"] }
        Returns: Database["public"]["Enums"]["control_account_type"]
      }
      create_customer_receipt: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_notes?: string
          p_payment_method?: Database["public"]["Enums"]["payment_method"]
          p_receipt_date?: string
          p_reference_number?: string
          p_store_id: string
        }
        Returns: string
      }
      create_journal_entry: {
        Args: {
          p_description: string
          p_entry_date: string
          p_lines: Json
          p_reference?: string
          p_source_id?: string
          p_source_type?: Database["public"]["Enums"]["journal_source_type"]
          p_store_id?: string
        }
        Returns: string
      }
      create_online_order: {
        Args: {
          p_billing_address_id?: string
          p_channel?: string
          p_idempotency_key?: string
          p_lines: Json
          p_shipping_address_id: string
        }
        Returns: string
      }
      create_organization_with_owner: {
        Args: { org_name: string }
        Returns: string
      }
      create_stock_transfer: {
        Args: {
          p_from_store_id: string
          p_item_id: string
          p_notes?: string
          p_quantity: number
          p_reference?: string
          p_to_store_id: string
          p_transaction_date?: string
        }
        Returns: string
      }
      create_supplier_payment: {
        Args: {
          p_amount: number
          p_notes?: string
          p_payment_date?: string
          p_payment_method?: Database["public"]["Enums"]["payment_method"]
          p_reference_number?: string
          p_store_id: string
          p_supplier_id: string
        }
        Returns: string
      }
      current_org_id: { Args: never; Returns: string }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      customer_belongs_to_org: {
        Args: { p_customer_id: string }
        Returns: boolean
      }
      delete_product_media: { Args: { p_media_id: string }; Returns: string }
      ensure_loyalty_account: {
        Args: { p_customer_id: string }
        Returns: string
      }
      get_control_account: {
        Args: {
          p_control_type: Database["public"]["Enums"]["control_account_type"]
        }
        Returns: string
      }
      get_item_public_availability: {
        Args: { p_item_id: string }
        Returns: boolean
      }
      get_item_store_average_cost: {
        Args: { p_item_id: string; p_store_id: string }
        Returns: number
      }
      get_role_account: {
        Args: { p_role: Database["public"]["Enums"]["ledger_account_role"] }
        Returns: string
      }
      has_store_access: { Args: { target_store_id: string }; Returns: boolean }
      is_org_public_storefront: { Args: { p_org_id: string }; Returns: boolean }
      next_document_number: {
        Args: {
          p_sequence_type: Database["public"]["Enums"]["document_sequence_type"]
          p_store_id: string
        }
        Returns: string
      }
      post_purchase: { Args: { p_purchase_id: string }; Returns: string }
      post_purchase_return: {
        Args: { p_purchase_return_id: string }
        Returns: string
      }
      post_sale: { Args: { p_sale_id: string }; Returns: string }
      post_sales_return: {
        Args: { p_sales_return_id: string }
        Returns: string
      }
      post_stock_adjustment: {
        Args: {
          p_adjustment_reason: Database["public"]["Enums"]["stock_adjustment_reason"]
          p_item_id: string
          p_movement_type: Database["public"]["Enums"]["stock_movement_type"]
          p_notes?: string
          p_quantity: number
          p_reference?: string
          p_store_id: string
          p_transaction_date?: string
          p_unit_cost?: number
        }
        Returns: string
      }
      preview_loyalty_redemption: {
        Args: { p_customer_id: string; p_points: number }
        Returns: {
          available_points: number
          message: string
          redemption_value: number
          valid: boolean
        }[]
      }
      primary_storefront_org_id: { Args: never; Returns: string }
      purchase_belongs_to_org: {
        Args: { p_purchase_id: string }
        Returns: boolean
      }
      purchase_line_net_unit_cost: {
        Args: { p_purchase_line_id: string }
        Returns: number
      }
      rebuild_item_store_cost: {
        Args: { p_item_id: string; p_store_id: string }
        Returns: number
      }
      record_stock_movement: {
        Args: {
          p_adjustment_reason?: Database["public"]["Enums"]["stock_adjustment_reason"]
          p_cost_basis: Database["public"]["Enums"]["cost_basis_source"]
          p_direction: Database["public"]["Enums"]["stock_direction"]
          p_item_id: string
          p_movement_type: Database["public"]["Enums"]["stock_movement_type"]
          p_notes?: string
          p_quantity: number
          p_reference?: string
          p_source_movement_id?: string
          p_store_id: string
          p_transaction_date?: string
          p_transfer_group_id?: string
          p_unit_cost: number
        }
        Returns: string
      }
      reorder_product_media: {
        Args: { p_item_id: string; p_media_ids: string[] }
        Returns: undefined
      }
      reserve_all_lines_at_store: {
        Args: { p_order_id: string; p_store_id: string }
        Returns: undefined
      }
      reserve_online_order_stock: {
        Args: { p_order_id: string }
        Returns: number
      }
      sale_belongs_to_org: { Args: { p_sale_id: string }; Returns: boolean }
      set_primary_product_media: {
        Args: { p_media_id: string }
        Returns: undefined
      }
      store_belongs_to_org: { Args: { p_store_id: string }; Returns: boolean }
      supplier_belongs_to_org: {
        Args: { p_supplier_id: string }
        Returns: boolean
      }
      terminal_belongs_to_store: {
        Args: { p_store_id: string; p_terminal_id: string }
        Returns: boolean
      }
    }
    Enums: {
      account_type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE"
      audit_action: "INSERT" | "UPDATE" | "DELETE"
      balance_side: "DEBIT" | "CREDIT"
      cash_session_status: "OPEN" | "CLOSED"
      control_account_type: "NONE" | "CUSTOMER" | "SUPPLIER" | "CASH" | "BANK"
      cost_basis_source:
        | "WEIGHTED_AVERAGE"
        | "HISTORICAL_LOT"
        | "OPENING"
        | "MANUAL"
      document_sequence_type:
        | "PURCHASE"
        | "SALE"
        | "PURCHASE_RETURN"
        | "SALE_RETURN"
        | "RECEIPT"
        | "PAYMENT"
      journal_source_type:
        | "OPENING"
        | "SALE"
        | "PURCHASE"
        | "PAYMENT"
        | "RECEIPT"
        | "EXPENSE"
        | "INCOME"
        | "ADJUSTMENT"
        | "TRANSFER"
        | "MANUAL"
      ledger_account_role:
        | "INVENTORY"
        | "SALES_REVENUE"
        | "COGS"
        | "INVENTORY_LOSS"
      loyalty_account_status: "ACTIVE" | "SUSPENDED" | "CLOSED"
      loyalty_transaction_type:
        | "EARN"
        | "REDEEM"
        | "REVERSAL"
        | "EXPIRY"
        | "BONUS"
        | "ADJUSTMENT"
      payment_method: "CASH" | "BANK" | "UPI" | "CARD" | "CREDIT" | "OTHER"
      stock_adjustment_reason: "DAMAGE" | "LOSS" | "FOUND" | "RECOUNT" | "OTHER"
      stock_direction: "IN" | "OUT"
      stock_movement_type:
        | "OPENING"
        | "PURCHASE"
        | "SALE"
        | "SALE_RETURN"
        | "PURCHASE_RETURN"
        | "TRANSFER_OUT"
        | "TRANSFER_IN"
        | "ADJUSTMENT_IN"
        | "ADJUSTMENT_OUT"
        | "DAMAGE"
        | "OTHER"
      store_type: "COMPANY" | "FRANCHISE"
      transaction_status: "DRAFT" | "POSTED" | "CANCELLED"
      user_role:
        | "OWNER"
        | "ADMIN"
        | "STORE_MANAGER"
        | "SALES"
        | "STOCK"
        | "ACCOUNTANT"
        | "FRANCHISE"
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
      account_type: ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"],
      audit_action: ["INSERT", "UPDATE", "DELETE"],
      balance_side: ["DEBIT", "CREDIT"],
      cash_session_status: ["OPEN", "CLOSED"],
      control_account_type: ["NONE", "CUSTOMER", "SUPPLIER", "CASH", "BANK"],
      cost_basis_source: [
        "WEIGHTED_AVERAGE",
        "HISTORICAL_LOT",
        "OPENING",
        "MANUAL",
      ],
      document_sequence_type: [
        "PURCHASE",
        "SALE",
        "PURCHASE_RETURN",
        "SALE_RETURN",
        "RECEIPT",
        "PAYMENT",
      ],
      journal_source_type: [
        "OPENING",
        "SALE",
        "PURCHASE",
        "PAYMENT",
        "RECEIPT",
        "EXPENSE",
        "INCOME",
        "ADJUSTMENT",
        "TRANSFER",
        "MANUAL",
      ],
      ledger_account_role: [
        "INVENTORY",
        "SALES_REVENUE",
        "COGS",
        "INVENTORY_LOSS",
      ],
      loyalty_account_status: ["ACTIVE", "SUSPENDED", "CLOSED"],
      loyalty_transaction_type: [
        "EARN",
        "REDEEM",
        "REVERSAL",
        "EXPIRY",
        "BONUS",
        "ADJUSTMENT",
      ],
      payment_method: ["CASH", "BANK", "UPI", "CARD", "CREDIT", "OTHER"],
      stock_adjustment_reason: ["DAMAGE", "LOSS", "FOUND", "RECOUNT", "OTHER"],
      stock_direction: ["IN", "OUT"],
      stock_movement_type: [
        "OPENING",
        "PURCHASE",
        "SALE",
        "SALE_RETURN",
        "PURCHASE_RETURN",
        "TRANSFER_OUT",
        "TRANSFER_IN",
        "ADJUSTMENT_IN",
        "ADJUSTMENT_OUT",
        "DAMAGE",
        "OTHER",
      ],
      store_type: ["COMPANY", "FRANCHISE"],
      transaction_status: ["DRAFT", "POSTED", "CANCELLED"],
      user_role: [
        "OWNER",
        "ADMIN",
        "STORE_MANAGER",
        "SALES",
        "STOCK",
        "ACCOUNTANT",
        "FRANCHISE",
      ],
    },
  },
} as const

