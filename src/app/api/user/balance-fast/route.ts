import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { BalanceService } from '@/lib/services/balance.service'
import { ApiKeyService } from '@/lib/services/apikey.service'
import { supabaseAdmin } from '@/lib/supabase'
import { getConversionRateByProvider, getPricingMultiplierByProvider } from '@/config/gateway.config'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    // 获取用户信息
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('total_recharge_amount, short_id')
      .eq('id', session.user.id)
      .single()

    if (userError) {
      console.error('获取用户信息失败:', userError)
      throw new Error('获取用户信息失败: ' + userError.message)
    }

    if (!user) {
      throw new Error('用户不存在')
    }

    const totalRechargeInYuan = user.total_recharge_amount || 0
    const shortId = user.short_id

    // 获取用户分配的 API Key
    const userKeys = await ApiKeyService.getApiKeysByUserId(session.user.id)
    const currentKey = userKeys.find(k => k.status === 'assigned')

    if (!currentKey) {
      console.warn('[balance-fast] No assigned API key found for user:', session.user.id)
      // 没有分配的 key，返回充值金额作为余额
      return NextResponse.json({
        success: true,
        data: {
          balance: totalRechargeInYuan * 10,
          totalRechargeAmount: totalRechargeInYuan,
          totalRecharge: totalRechargeInYuan,
          apiConsumption: 0,
          message: '余额刷新完成（无API消耗）',
        },
      })
    }

    const apiKey = currentKey.key_value
    const provider = currentKey.provider || 'lsapi'

    // 查询 API Key 使用情况
    const usage = await BalanceService.queryApiKeyUsage(apiKey, session.user.id, shortId, provider)

    let apiConsumption = 0
    if (usage.success && usage.data) {
      const conversionRate = getConversionRateByProvider(provider)
      const pricingMultiplier = getPricingMultiplierByProvider(provider)
      const rawConsumption = usage.data.used / conversionRate
      apiConsumption = rawConsumption * pricingMultiplier
    }

    const balanceInYuan = totalRechargeInYuan - apiConsumption
    const currentBalance = balanceInYuan * 10

    return NextResponse.json({
      success: true,
      data: {
        balance: currentBalance,
        totalRechargeAmount: totalRechargeInYuan,
        totalRecharge: totalRechargeInYuan,
        apiConsumption: apiConsumption,
        message: '快速余额刷新完成',
      },
    })
  } catch (error) {
    console.error('快速余额刷新失败:', error)
    return NextResponse.json(
      {
        error: '刷新余额失败',
        message: error instanceof Error ? error.message : '服务器内部错误',
      },
      { status: 500 }
    )
  }
}
