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
      cart_items: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          product_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          product_id: string
          quantity?: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "shop_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          gender: string | null
          id: string
          location: string | null
          loyalty_points: number
          mobile: string
          name: string | null
          store_id: string
          total_spent: number
          updated_at: string
          visit_count: number
        }
        Insert: {
          created_at?: string
          email?: string | null
          gender?: string | null
          id?: string
          location?: string | null
          loyalty_points?: number
          mobile: string
          name?: string | null
          store_id: string
          total_spent?: number
          updated_at?: string
          visit_count?: number
        }
        Update: {
          created_at?: string
          email?: string | null
          gender?: string | null
          id?: string
          location?: string | null
          loyalty_points?: number
          mobile?: string
          name?: string | null
          store_id?: string
          total_spent?: number
          updated_at?: string
          visit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          joining_date: string | null
          name: string
          phone: string | null
          role: string
          salary: number | null
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          joining_date?: string | null
          name: string
          phone?: string | null
          role?: string
          salary?: number | null
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          joining_date?: string | null
          name?: string
          phone?: string | null
          role?: string
          salary?: number | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_batches: {
        Row: {
          batch_number: string | null
          buying_price: number
          created_at: string
          id: string
          product_id: string
          quantity: number
          received_at: string
          store_id: string
          supplier: string | null
        }
        Insert: {
          batch_number?: string | null
          buying_price?: number
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          received_at?: string
          store_id: string
          supplier?: string | null
        }
        Update: {
          batch_number?: string | null
          buying_price?: number
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          received_at?: string
          store_id?: string
          supplier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          batch_id: string | null
          discount: number
          id: string
          invoice_id: string
          product_id: string
          quantity: number
          returned_quantity: number
          tax_amount: number
          total: number
          unit_price: number
        }
        Insert: {
          batch_id?: string | null
          discount?: number
          id?: string
          invoice_id: string
          product_id: string
          quantity?: number
          returned_quantity?: number
          tax_amount?: number
          total: number
          unit_price: number
        }
        Update: {
          batch_id?: string | null
          discount?: number
          id?: string
          invoice_id?: string
          product_id?: string
          quantity?: number
          returned_quantity?: number
          tax_amount?: number
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_returns: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          invoice_item_id: string
          product_id: string
          quantity_returned: number
          reason: string | null
          refund_amount: number
          store_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          invoice_item_id: string
          product_id: string
          quantity_returned?: number
          reason?: string | null
          refund_amount?: number
          store_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          invoice_item_id?: string
          product_id?: string
          quantity_returned?: number
          reason?: string | null
          refund_amount?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_returns_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_returns_invoice_item_id_fkey"
            columns: ["invoice_item_id"]
            isOneToOne: false
            referencedRelation: "invoice_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_returns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          discount_amount: number
          employee_id: string | null
          id: string
          invoice_number: string
          loyalty_points_earned: number
          notes: string | null
          payment_method: string
          source: string
          status: string
          store_id: string
          subtotal: number
          tax_amount: number
          total_amount: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount_amount?: number
          employee_id?: string | null
          id?: string
          invoice_number: string
          loyalty_points_earned?: number
          notes?: string | null
          payment_method?: string
          source?: string
          status?: string
          store_id: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount_amount?: number
          employee_id?: string | null
          id?: string
          invoice_number?: string
          loyalty_points_earned?: number
          notes?: string | null
          payment_method?: string
          source?: string
          status?: string
          store_id?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          created_at: string
          customer_id: string
          description: string | null
          id: string
          invoice_id: string | null
          points: number
          store_id: string
          type: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          description?: string | null
          id?: string
          invoice_id?: string | null
          points: number
          store_id: string
          type?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          description?: string | null
          id?: string
          invoice_id?: string | null
          points?: number
          store_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string
          quantity: number
          tax_amount: number
          total: number
          unit_price: number
        }
        Insert: {
          id?: string
          order_id: string
          product_id: string
          quantity?: number
          tax_amount?: number
          total: number
          unit_price: number
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          tax_amount?: number
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          courier_name: string | null
          created_at: string
          customer_id: string
          discount_amount: number
          id: string
          notes: string | null
          order_number: string
          payment_id: string | null
          payment_method: string | null
          payment_status: string
          shipping_address_id: string | null
          shipping_amount: number
          shiprocket_order_id: string | null
          shiprocket_shipment_id: string | null
          status: string
          store_id: string
          subtotal: number
          tax_amount: number
          total_amount: number
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          courier_name?: string | null
          created_at?: string
          customer_id: string
          discount_amount?: number
          id?: string
          notes?: string | null
          order_number: string
          payment_id?: string | null
          payment_method?: string | null
          payment_status?: string
          shipping_address_id?: string | null
          shipping_amount?: number
          shiprocket_order_id?: string | null
          shiprocket_shipment_id?: string | null
          status?: string
          store_id: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          courier_name?: string | null
          created_at?: string
          customer_id?: string
          discount_amount?: number
          id?: string
          notes?: string | null
          order_number?: string
          payment_id?: string | null
          payment_method?: string | null
          payment_status?: string
          shipping_address_id?: string | null
          shipping_amount?: number
          shiprocket_order_id?: string | null
          shiprocket_shipment_id?: string | null
          status?: string
          store_id?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "shop_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shipping_address_id_fkey"
            columns: ["shipping_address_id"]
            isOneToOne: false
            referencedRelation: "shipping_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_codes: {
        Row: {
          code: string
          created_at: string
          email: string
          expires_at: string
          id: string
          used: boolean
        }
        Insert: {
          code: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          used?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          used?: boolean
        }
        Relationships: []
      }
      products: {
        Row: {
          brand: string | null
          buying_price: number | null
          category: string | null
          color: string | null
          created_at: string
          hsn_code: string | null
          id: string
          is_active: boolean
          material: string | null
          mrp: number | null
          name: string
          photo_url: string | null
          selling_price: number
          size: string | null
          sku: string
          store_id: string
          subcategory: string | null
          tax_rate: number
          updated_at: string
          video_url: string | null
        }
        Insert: {
          brand?: string | null
          buying_price?: number | null
          category?: string | null
          color?: string | null
          created_at?: string
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          material?: string | null
          mrp?: number | null
          name: string
          photo_url?: string | null
          selling_price?: number
          size?: string | null
          sku: string
          store_id: string
          subcategory?: string | null
          tax_rate?: number
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          brand?: string | null
          buying_price?: number | null
          category?: string | null
          color?: string | null
          created_at?: string
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          material?: string | null
          mrp?: number | null
          name?: string
          photo_url?: string | null
          selling_price?: number
          size?: string | null
          sku?: string
          store_id?: string
          subcategory?: string | null
          tax_rate?: number
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          role: string
          store_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string
          store_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string
          store_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          created_at: string
          customer_id: string
          id: string
          is_default: boolean
          name: string
          phone: string
          pincode: string
          state: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          city: string
          created_at?: string
          customer_id: string
          id?: string
          is_default?: boolean
          name: string
          phone: string
          pincode: string
          state: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          created_at?: string
          customer_id?: string
          id?: string
          is_default?: boolean
          name?: string
          phone?: string
          pincode?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "shop_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      store_settings: {
        Row: {
          created_at: string
          default_discount_percent: number
          id: string
          invoice_prefix: string
          loyalty_amount_unit: number
          loyalty_points_per_amount: number
          sms_enabled: boolean
          store_id: string
          updated_at: string
          whatsapp_enabled: boolean
        }
        Insert: {
          created_at?: string
          default_discount_percent?: number
          id?: string
          invoice_prefix?: string
          loyalty_amount_unit?: number
          loyalty_points_per_amount?: number
          sms_enabled?: boolean
          store_id: string
          updated_at?: string
          whatsapp_enabled?: boolean
        }
        Update: {
          created_at?: string
          default_discount_percent?: number
          id?: string
          invoice_prefix?: string
          loyalty_amount_unit?: number
          loyalty_points_per_amount?: number
          sms_enabled?: boolean
          store_id?: string
          updated_at?: string
          whatsapp_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          gst_number: string | null
          gst_state_code: string | null
          id: string
          location: string | null
          logo_url: string | null
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          gst_state_code?: string | null
          id?: string
          location?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          gst_state_code?: string | null
          id?: string
          location?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          can_customers: boolean
          can_inventory: boolean
          can_invoicing: boolean
          can_photos: boolean
          created_at: string
          id: string
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_customers?: boolean
          can_inventory?: boolean
          can_invoicing?: boolean
          can_photos?: boolean
          created_at?: string
          id?: string
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_customers?: boolean
          can_inventory?: boolean
          can_invoicing?: boolean
          can_photos?: boolean
          created_at?: string
          id?: string
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_current_user_store_id: { Args: never; Returns: string }
      get_in_stock_product_ids: {
        Args: { p_store_id: string }
        Returns: string[]
      }
      get_in_stock_shop_products: {
        Args: { p_category?: string; p_limit?: number; p_store_id: string }
        Returns: {
          brand: string | null
          buying_price: number | null
          category: string | null
          color: string | null
          created_at: string
          hsn_code: string | null
          id: string
          is_active: boolean
          material: string | null
          mrp: number | null
          name: string
          photo_url: string | null
          selling_price: number
          size: string | null
          sku: string
          store_id: string
          subcategory: string | null
          tax_rate: number
          updated_at: string
          video_url: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_product_stock: { Args: { p_product_id: string }; Returns: number }
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
