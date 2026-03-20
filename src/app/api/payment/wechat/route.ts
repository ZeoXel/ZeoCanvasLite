import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { createPaymentOrder } from '@/services/paymentService'
import { rechargeOptions } from '@/components/recharge/types'
import crypto from 'crypto'

// 微信支付配置
const WECHAT_CONFIG = {
  mchid: process.env.WECHAT_MCH_ID || process.env.WECHAT_MCHID || '',
  appid: process.env.WECHAT_APPID || '',
  serial: process.env.WECHAT_SERIAL_NO || '',
  apiv3Key: process.env.WECHAT_API_V3_KEY || process.env.WECHAT_API_KEY || '',
}

// 转换单行私钥为正确的PEM格式
function formatPrivateKey(privateKey: string): string {
  if (!privateKey) return privateKey

  // 如果已经是多行格式，直接返回
  if (privateKey.includes('\n') && privateKey.includes('-----BEGIN')) {
    return privateKey
  }

  // 单行格式转多行PEM格式
  const header = '-----BEGIN PRIVATE KEY-----'
  const footer = '-----END PRIVATE KEY-----'

  // 移除头尾标记，获取纯密钥内容
  let keyContent = privateKey
    .replace(header, '')
    .replace(footer, '')
    .replace(/\s+/g, '') // 移除所有空格和换行符
    .trim()

  // 验证密钥内容不为空
  if (!keyContent) {
    throw new Error('私钥内容为空')
  }

  // 每64个字符换行
  const formattedContent = keyContent.match(/.{1,64}/g)?.join('\n') || keyContent

  return `${header}\n${formattedContent}\n${footer}`
}

// 读取微信支付私钥
let wechatPrivateKey: string | null = null
try {
  if (process.env.WECHAT_PRIVATE_KEY) {
    wechatPrivateKey = formatPrivateKey(process.env.WECHAT_PRIVATE_KEY)
    console.log('[Wechat] 私钥加载成功')
  }
} catch (error: any) {
  console.error('[Wechat] 私钥加载失败:', error.message)
  wechatPrivateKey = null
}

// 微信支付签名生成
function generateWechatSignature(method: string, url: string, timestamp: number, nonce: string, body: string): string {
  if (!wechatPrivateKey) {
    throw new Error('微信支付私钥未加载')
  }

  // 构造签名字符串
  const signatureStr = [method, url, timestamp, nonce, body].join('\n') + '\n'

  // 使用私钥签名
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(signatureStr, 'utf8')
  const signature = sign.sign(wechatPrivateKey, 'base64')

  return signature
}

// 生成随机字符串
function generateNonceStr(): string {
  return crypto.randomBytes(16).toString('hex')
}

// 检查微信支付是否可用
function isWechatPayAvailable(): boolean {
  const required = ['mchid', 'appid', 'serial', 'apiv3Key'] as const
  const missing = required.filter(key => !WECHAT_CONFIG[key])

  if (missing.length > 0 || !wechatPrivateKey) {
    return false
  }

  return true
}

// 微信Native支付（扫码支付）
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

    // 检查微信支付配置
    if (!isWechatPayAvailable()) {
      return NextResponse.json(
        { error: '支付服务不可用', message: '微信支付配置不完整' },
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
      paymentMethod: 'wechat',
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
      const timestamp = Math.floor(Date.now() / 1000)
      const nonceStr = generateNonceStr()

      // 构建请求体
      const requestBody = {
        appid: WECHAT_CONFIG.appid,
        mchid: WECHAT_CONFIG.mchid,
        description,
        out_trade_no: order.orderNo,
        notify_url: `${baseUrl}/api/payment/wechat/notify`,
        amount: {
          total: amount,
          currency: 'CNY',
        },
      }

      const bodyStr = JSON.stringify(requestBody)
      const urlPath = '/v3/pay/transactions/native'

      // 生成签名
      const signature = generateWechatSignature('POST', urlPath, timestamp, nonceStr, bodyStr)

      // 发起请求
      const response = await fetch('https://api.mch.weixin.qq.com/v3/pay/transactions/native', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'WechatPay-NodeJS-SDK',
          'Authorization': `WECHATPAY2-SHA256-RSA2048 mchid="${WECHAT_CONFIG.mchid}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${WECHAT_CONFIG.serial}"`,
        },
        body: bodyStr,
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('[Wechat] 下单失败:', result)
        return NextResponse.json(
          { error: '微信支付下单失败', message: result.message || '未知错误' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        data: {
          qr_code: result.code_url,
          order_no: order.orderNo,
          pay_type: 'wechat',
          payment_method: 'native',
          amount,
          points,
        },
      })
    } catch (err) {
      console.error('[Wechat] 下单异常:', err)
      return NextResponse.json(
        { error: '微信支付下单失败', message: err instanceof Error ? err.message : '未知错误' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('[Wechat] 接口异常:', error)
    return NextResponse.json(
      { error: '支付下单失败', message: error instanceof Error ? error.message : '服务器内部错误' },
      { status: 500 }
    )
  }
}
