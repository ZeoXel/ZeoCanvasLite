import { supabaseAdmin } from '@/lib/supabase'

// 推广者类型
export interface Promoter {
  id: string
  user_id: string
  user_phone: string              // 新增:推广者手机号
  promo_code: string
  bonus_amount: number
  is_active: boolean
  note?: string
  created_at: string
  updated_at: string
}

// 推广记录类型
export interface Promotion {
  id: string
  promoter_id: string
  promoter_phone: string          // 新增:推广者手机号
  invited_user_id: string
  invited_user_phone: string      // 新增:被邀请用户手机号
  bonus_given: number
  total_recharged: number
  created_at: string
  updated_at: string
}

// 推广统计类型
export interface PromoterStats {
  id: string
  user_id: string
  user_phone: string              // 直接显示手机号
  user_short_id: string           // 添加短ID
  promo_code: string
  bonus_amount: number
  is_active: boolean
  promoter_name: string
  total_invites: number
  total_revenue: number
  avg_revenue_per_user: number
  created_at: string
}

export class PromoterService {
  /**
   * 生成推广码
   */
  static generatePromoCode(prefix: string = 'LS'): string {
    const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    let code = prefix
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  }

  /**
   * 创建推广者
   */
  static async createPromoter(
    userId: string,
    options?: { promoCode?: string; bonusAmount?: number; note?: string }
  ): Promise<Promoter> {
    const promoCode = options?.promoCode || this.generatePromoCode()
    const bonusAmount = options?.bonusAmount ?? 10.00

    const { data, error } = await supabaseAdmin
      .from('promoters')
      .insert({
        user_id: userId,
        promo_code: promoCode,
        bonus_amount: bonusAmount,
        note: options?.note
      })
      .select()
      .single()

    if (error) {
      console.error('创建推广者失败:', error)
      throw new Error(`创建推广者失败: ${error.message}`)
    }

    return data
  }

  /**
   * 根据推广码获取推广者
   */
  static async getPromoterByCode(promoCode: string): Promise<Promoter | null> {
    const { data, error } = await supabaseAdmin
      .from('promoters')
      .select('*')
      .eq('promo_code', promoCode.toUpperCase())
      .eq('is_active', true)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // 推广码不存在
      }
      throw new Error(`查询推广者失败: ${error.message}`)
    }

    return data
  }

  /**
   * 根据用户ID获取推广者
   */
  static async getPromoterByUserId(userId: string): Promise<Promoter | null> {
    const { data, error } = await supabaseAdmin
      .from('promoters')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      throw new Error(`查询推广者失败: ${error.message}`)
    }

    return data
  }

  /**
   * 验证推广码是否有效
   */
  static async validatePromoCode(promoCode: string): Promise<{ valid: boolean; bonusAmount: number; promoterId?: string }> {
    const promoter = await this.getPromoterByCode(promoCode)

    if (!promoter) {
      return { valid: false, bonusAmount: 0 }
    }

    return {
      valid: true,
      bonusAmount: promoter.bonus_amount,
      promoterId: promoter.id
    }
  }

  /**
   * 记录推广关系
   */
  static async createPromotion(
    promoterId: string,
    invitedUserId: string,
    bonusGiven: number
  ): Promise<Promotion> {
    const { data, error } = await supabaseAdmin
      .from('promotions')
      .insert({
        promoter_id: promoterId,
        invited_user_id: invitedUserId,
        bonus_given: bonusGiven
      })
      .select()
      .single()

    if (error) {
      console.error('创建推广记录失败:', error)
      throw new Error(`创建推广记录失败: ${error.message}`)
    }

    console.log('✅ 推广记录创建成功:', { promoterId, invitedUserId, bonusGiven })
    return data
  }

  /**
   * 获取推广者统计数据
   */
  static async getPromoterStats(userId: string): Promise<PromoterStats | null> {
    const { data, error } = await supabaseAdmin
      .from('promoter_stats')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      throw new Error(`查询推广统计失败: ${error.message}`)
    }

    return data
  }

  /**
   * 获取所有推广者统计(管理员用)
   */
  static async getAllPromoterStats(): Promise<PromoterStats[]> {
    const { data, error } = await supabaseAdmin
      .from('promoter_stats')
      .select('*')
      .order('total_invites', { ascending: false })

    if (error) {
      throw new Error(`查询推广统计失败: ${error.message}`)
    }

    return data || []
  }

  /**
   * 获取某推广者的所有推广记录
   */
  static async getPromotionsByPromoter(promoterId: string): Promise<Promotion[]> {
    const { data, error } = await supabaseAdmin
      .from('promotions')
      .select('*')
      .eq('promoter_id', promoterId)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`查询推广记录失败: ${error.message}`)
    }

    return data || []
  }

  /**
   * 更新推广者配置
   */
  static async updatePromoter(
    promoterId: string,
    updates: { bonus_amount?: number; is_active?: boolean; note?: string }
  ): Promise<Promoter> {
    const { data, error } = await supabaseAdmin
      .from('promoters')
      .update(updates)
      .eq('id', promoterId)
      .select()
      .single()

    if (error) {
      throw new Error(`更新推广者失败: ${error.message}`)
    }

    return data
  }

  /**
   * 检查用户是否已被推广(避免重复记录)
   */
  static async isUserInvited(userId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from('promotions')
      .select('id')
      .eq('invited_user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw new Error(`查询推广记录失败: ${error.message}`)
    }

    return !!data
  }
}
