import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getPaymentOrder, completePayment } from '@/services/paymentService'

// 支付宝SDK导入（用于主动查询）
let AlipaySdk: any = null
let alipaySdk: any = null

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

  if (AlipaySdk && process.env.ALIPAY_APPID) {
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
    }
  }
} catch (error) {
  console.error('[OrderStatus] 支付宝SDK初始化失败:', error)
}

// 主动查询支付宝订单状态
async function queryAlipayOrderStatus(orderNo: string): Promise<{ paid: boolean; tradeNo?: string }> {
  if (!alipaySdk) {
    return { paid: false }
  }

  try {
    const result = await alipaySdk.exec('alipay.trade.query', {
      bizContent: {
        out_trade_no: orderNo,
      },
    })

    console.log('[OrderStatus] 支付宝查询结果:', {
      orderNo,
      code: result.code,
      tradeStatus: result.tradeStatus,
    })

    if (result.code === '10000' && (result.tradeStatus === 'TRADE_SUCCESS' || result.tradeStatus === 'TRADE_FINISHED')) {
      return { paid: true, tradeNo: result.tradeNo }
    }

    return { paid: false }
  } catch (error) {
    console.error('[OrderStatus] 支付宝查询失败:', error)
    return { paid: false }
  }
}

// 订单状态查询接口
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderNo: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { orderNo } = await params

    if (!orderNo) {
      return NextResponse.json(
        { error: '参数错误', message: '订单号不能为空' },
        { status: 400 }
      )
    }

    // 获取支付订单
    const payment = await getPaymentOrder(orderNo)

    if (!payment) {
      return NextResponse.json(
        { status: 'notfound', message: '订单不存在' },
        { status: 404 }
      )
    }

    // 验证订单归属
    if (payment.user_id !== session.user.id) {
      return NextResponse.json(
        { error: '权限不足' },
        { status: 403 }
      )
    }

    // 如果订单仍在等待中，主动查询支付平台
    if (payment.status === 'pending') {
      if (payment.payment_method === 'alipay') {
        const alipayResult = await queryAlipayOrderStatus(orderNo)
        if (alipayResult.paid) {
          // 支付宝已支付，更新订单状态
          await completePayment(orderNo, alipayResult.tradeNo)
          console.log('[OrderStatus] 主动查询发现支付宝已支付，已更新订单:', orderNo)

          return NextResponse.json({
            success: true,
            data: {
              status: 'paid',
              pay_type: payment.payment_method,
              order_no: payment.order_no,
              amount: payment.amount,
              points: payment.points,
              description: payment.description,
              created_at: payment.created_at,
              paid_at: new Date().toISOString(),
              transaction_id: alipayResult.tradeNo,
            },
          })
        }
      }
      // TODO: 添加微信支付主动查询
    }

    // 返回订单状态
    return NextResponse.json({
      success: true,
      data: {
        status: payment.status,
        pay_type: payment.payment_method,
        order_no: payment.order_no,
        amount: payment.amount,
        points: payment.points,
        description: payment.description,
        created_at: payment.created_at,
        paid_at: payment.paid_at,
        transaction_id: payment.transaction_id,
      },
    })
  } catch (error) {
    console.error('[OrderStatus] 查询失败:', error)
    return NextResponse.json(
      { error: '查询失败', message: error instanceof Error ? error.message : '服务器内部错误' },
      { status: 500 }
    )
  }
}
