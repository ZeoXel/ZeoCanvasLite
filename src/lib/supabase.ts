import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null
let _supabaseAdmin: SupabaseClient | null = null

// 客户端 Supabase 客户端 (用于前端) - 懒加载避免构建时初始化
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabase) {
      _supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          db: { schema: 'public' },
          auth: { persistSession: true, autoRefreshToken: true },
          realtime: { params: { eventsPerSecond: 2 } },
        }
      )
    }
    const value = (_supabase as any)[prop]
    return typeof value === 'function' ? value.bind(_supabase) : value
  },
})

// 服务端 Supabase 客户端 (用于 API 路由) - 懒加载避免构建时初始化
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabaseAdmin) {
      _supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: { autoRefreshToken: false, persistSession: false },
          global: {
            fetch: (url, options = {}) => fetch(url, { ...options }),
          },
        }
      )
    }
    const value = (_supabaseAdmin as any)[prop]
    return typeof value === 'function' ? value.bind(_supabaseAdmin) : value
  },
})

// 数据库类型定义
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          short_id?: string
          phone: string
          name: string
          balance: number
          total_recharge_amount: number
          assigned_key_id?: string
          role: 'user' | 'admin' | 'super_admin'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          short_id?: string
          phone: string
          name: string
          balance?: number
          total_recharge_amount?: number
          assigned_key_id?: string
          role?: 'user' | 'admin' | 'super_admin'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          short_id?: string
          phone?: string
          name?: string
          balance?: number
          total_recharge_amount?: number
          assigned_key_id?: string
          role?: 'user' | 'admin' | 'super_admin'
          created_at?: string
          updated_at?: string
        }
      }
      api_keys: {
        Row: {
          id: string
          key_value: string
          provider: string
          status: 'active' | 'assigned' | 'expired'
          assigned_user_id: string | null
          created_at: string
          assigned_at: string | null
        }
        Insert: {
          id?: string
          key_value: string
          provider: string
          status?: 'active' | 'assigned' | 'expired'
          assigned_user_id?: string | null
          created_at?: string
          assigned_at?: string | null
        }
        Update: {
          id?: string
          key_value?: string
          provider?: string
          status?: 'active' | 'assigned' | 'expired'
          assigned_user_id?: string | null
          created_at?: string
          assigned_at?: string | null
        }
      }
      verification_codes: {
        Row: {
          id: string
          phone: string
          code: string
          name?: string | null
          expires_at: string
          created_at: string
          used?: boolean
          used_at?: string | null
        }
        Insert: {
          id?: string
          phone: string
          code: string
          name?: string | null
          expires_at: string
          created_at?: string
          used?: boolean
          used_at?: string | null
        }
        Update: {
          id?: string
          phone?: string
          code?: string
          name?: string | null
          expires_at?: string
          created_at?: string
          used?: boolean
          used_at?: string | null
        }
      }
      user_display: {
        Row: {
          id: string
          short_id?: string
          phone: string
          name: string
          balance: number
          total_recharge_amount: number
          role: 'user' | 'admin' | 'super_admin'
          created_at: string
          updated_at: string
          friendly_id: string
        }
        Insert: {}
        Update: {}
      }
      payments: {
        Row: {
          id: string
          user_id: string
          order_no: string
          amount: number
          points: number
          payment_method: 'wechat' | 'alipay'
          description: string
          status: 'pending' | 'paid' | 'failed'
          transaction_id?: string | null
          created_at: string
          paid_at?: string | null
        }
        Insert: {
          id?: string
          user_id: string
          order_no: string
          amount: number
          points: number
          payment_method: 'wechat' | 'alipay'
          description: string
          status?: 'pending' | 'paid' | 'failed'
          transaction_id?: string | null
          created_at?: string
          paid_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          order_no?: string
          amount?: number
          points?: number
          payment_method?: 'wechat' | 'alipay'
          description?: string
          status?: 'pending' | 'paid' | 'failed'
          transaction_id?: string | null
          created_at?: string
          paid_at?: string | null
        }
      }
      balance_logs: {
        Row: {
          id: string
          user_id: string
          amount: number
          type: 'recharge' | 'consumption' | 'refund'
          description: string
          payment_id?: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          amount: number
          type: 'recharge' | 'consumption' | 'refund'
          description: string
          payment_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          amount?: number
          type?: 'recharge' | 'consumption' | 'refund'
          description?: string
          payment_id?: string | null
          created_at?: string
        }
      }
    }
  }
}
