import { NextRequest, NextResponse } from 'next/server'
import { PromoterService } from '@/lib/services/promoter.service'

/**
 * 验证推广码 API
 * GET /api/promo/validate?code=LS123456
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const promoCode = searchParams.get('code')

    if (!promoCode) {
      return NextResponse.json(
        { error: '缺少推广码参数' },
        { status: 400 }
      )
    }

    const validation = await PromoterService.validatePromoCode(promoCode)

    if (!validation.valid) {
      return NextResponse.json(
        {
          valid: false,
          message: '推广码无效或已失效'
        },
        { status: 200 }
      )
    }

    return NextResponse.json({
      valid: true,
      bonusAmount: validation.bonusAmount,
      message: `使用推广码可获得 ${validation.bonusAmount} 元奖励`
    })

  } catch (error) {
    console.error('验证推广码失败:', error)
    return NextResponse.json(
      { error: '验证推广码失败' },
      { status: 500 }
    )
  }
}
