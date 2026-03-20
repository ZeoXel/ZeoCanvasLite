import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { createPaymentOrder } from '@/services/paymentService'
import { rechargeOptions } from '@/components/recharge/types'

// 支付宝SDK导入
let AlipaySdk: any = null
try {
  const AlipaySdkModule = require('alipay-sdk')
  if (AlipaySdkModule && typeof AlipaySdkModule === 'function') {
    AlipaySdk = AlipaySdkModule
  } else if (AlipaySdkModule.default && typeof AlipaySdkModule.default === 'function') {
    AlipaySdk = AlipaySdkModule.default
  } else if (AlipaySdkModule.AlipaySdk && typeof AlipaySdkModule.AlipaySdk === 'function') {
    AlipaySdk = AlipaySdkModule.AlipaySdk
  } else {
    AlipaySdk = AlipaySdkModule
  }
} catch (error) {
  console.error('[Alipay] SDK导入失败:', error)
}

// 支付宝SDK初始化
let alipaySdk: any = null
if (AlipaySdk && process.env.ALIPAY_APPID) {
  try {
    let privateKey = process.env.ALIPAY_PRIVATE_KEY
    let publicKey = process.env.ALIPAY_PUBLIC_KEY

    if (privateKey && publicKey) {
      let processedPrivateKey = privateKey.trim()
      let processedPublicKey = publicKey.trim()

      if (!processedPrivateKey.includes('-----BEGIN')) {
        processedPrivateKey = `-----BEGIN PRIVATE KEY-----\n${processedPrivateKey}\n-----END PRIVATE KEY-----`
      }

      if (!processedPublicKey.includes('-----BEGIN')) {
        processedPublicKey = `-----BEGIN PUBLIC KEY-----\n${processedPublicKey}\n-----END PUBLIC KEY-----`
      }

      alipaySdk = new AlipaySdk({
        appId: process.env.ALIPAY_APPID,
        privateKey: processedPrivateKey,
        alipayPublicKey: processedPublicKey,
        gateway: 'https://openapi.alipay.com/gateway.do',
        signType: 'RSA2',
        keyType: 'PKCS8'
      })

      console.log('[Alipay] SDK初始化成功')
    }
  } catch (error) {
    console.error('[Alipay] SDK初始化失败:', error)
  }
}

// 支付宝扫码支付（当面付）
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { amount } = await request.json()

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: '参数错误', message: '金额必须大于0' },
        { status: 400 }
      )
    }

    if (!alipaySdk) {
      return NextResponse.json(
        { error: '支付服务不可用', message: '支付宝配置不完整' },
        { status: 503 }
      )
    }

    // 根据金额查找对应的积分
    const option = rechargeOptions.find(opt => opt.amount === amount)
    const points = option ? option.points + (option.bonus || 0) : Math.floor(amount / 10)
    const description = `充值${amount / 100}元`

    // 创建支付订单
    const order = await createPaymentOrder({
      userId: session.user.id,
      amount,
      points,
      paymentMethod: 'alipay',
      description,
    })

    if (!order) {
      return NextResponse.json(
        { error: '创建订单失败' },
        { status: 500 }
      )
    }

    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

      // 使用当面付预下单接口，生成二维码
      const result = await alipaySdk.exec('alipay.trade.precreate', {
        bizContent: {
          out_trade_no: order.orderNo,
          total_amount: (amount / 100).toFixed(2),
          subject: description,
          timeout_express: '15m',
        },
        notifyUrl: `${baseUrl}/api/payment/alipay/notify`,
      })

      console.log('[Alipay] 预下单结果:', result)

      // 检查返回结果
      if (result.code !== '10000') {
        console.error('[Alipay] 预下单失败:', result)
        return NextResponse.json(
          { error: '支付宝下单失败', message: result.subMsg || result.msg || '未知错误' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        data: {
          qr_code: result.qrCode,
          order_no: order.orderNo,
          pay_type: 'alipay',
          payment_method: 'qrcode',
          amount,
          points,
        },
      })
    } catch (err) {
      console.error('[Alipay] 下单失败:', err)
      return NextResponse.json(
        { error: '支付宝下单失败', message: err instanceof Error ? err.message : '未知错误' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('[Alipay] 接口异常:', error)
    return NextResponse.json(
      { error: '支付下单失败', message: error instanceof Error ? error.message : '服务器内部错误' },
      { status: 500 }
    )
  }
}
