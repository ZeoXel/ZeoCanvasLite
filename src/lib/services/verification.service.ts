import { supabaseAdmin } from '@/lib/supabase'

export class VerificationService {
  // 存储验证码
  static async storeVerificationCode(phone: string, code: string, name?: string): Promise<void> {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5分钟过期

    const { error } = await supabaseAdmin
      .from('verification_codes')
      .insert({
        phone,
        code,
        name: name || null,
        expires_at: expiresAt.toISOString(),
        used: false
      })

    if (error) {
      console.error('❌ 存储验证码失败:', error)
      throw new Error('存储验证码失败')
    }
  }

  // 验证验证码 - 优化版本，减少数据库往返
  static async verifyCode(phone: string, code: string): Promise<{ success: boolean; name?: string }> {
    const now = new Date()

    // 万能验证码 123456
    // 开发环境自动启用，生产环境需要设置 ALLOW_MASTER_CODE=true
    if (code === '123456') {
      const allowMasterCode =
        process.env.NODE_ENV === 'development' ||
        process.env.NEXT_PUBLIC_ENABLE_MASTER_CODE === 'true' ||
        process.env.ALLOW_MASTER_CODE === 'true'

      console.log('🔍 万能验证码检测:', {
        code,
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_ENABLE_MASTER_CODE: process.env.NEXT_PUBLIC_ENABLE_MASTER_CODE,
        ALLOW_MASTER_CODE: process.env.ALLOW_MASTER_CODE,
        allowMasterCode
      })

      if (allowMasterCode) {
        console.log('🔓 使用万能验证码')
        return { success: true }
      } else {
        console.log('⚠️ 万能验证码未启用，需要设置 ALLOW_MASTER_CODE=true')
      }
    }

    // 查找有效且未使用的验证码
    const { data, error } = await supabaseAdmin
      .from('verification_codes')
      .select('id, name')
      .eq('phone', phone)
      .eq('code', code)
      .eq('used', false)
      .gt('expires_at', now.toISOString())
      .limit(1)
      .single()

    if (error || !data) {
      console.log('❌ 验证码验证失败:', { phone, code, error })
      return { success: false }
    }

    // 标记为已使用
    await supabaseAdmin
      .from('verification_codes')
      .update({
        used: true,
        used_at: new Date().toISOString()
      })
      .eq('id', data.id)

    console.log('✅ 验证码验证成功:', { phone, code })
    return {
      success: true,
      name: data.name || undefined
    }
  }

  // 清理过期的验证码
  static async cleanupExpiredCodes(): Promise<number> {
    const now = new Date()

    const { data, error } = await supabaseAdmin
      .from('verification_codes')
      .delete()
      .lt('expires_at', now.toISOString())
      .select('id')

    if (error) {
      return 0
    }

    return data?.length || 0
  }
}