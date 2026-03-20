import { NextRequest, NextResponse } from 'next/server'
import { completePayment, getPaymentOrder } from '@/services/paymentService'
import crypto from 'crypto'

// 微信支付配置
const WECHAT_API_KEY = process.env.WECHAT_API_KEY

// AES-256-GCM 解密
function decryptWechatNotify(ciphertext: string, nonce: string, associatedData: string): string {
  if (!WECHAT_API_KEY) {
    throw new Error('微信支付API密钥未配置')
  }

  const key = WECHAT_API_KEY
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key),
    Buffer.from(nonce)
  )

  decipher.setAuthTag(Buffer.from(ciphertext.slice(-16), 'base64'))
  decipher.setAAD(Buffer.from(associatedData))

  const ciphertextBuffer = Buffer.from(ciphertext, 'base64')
  const actualCiphertext = ciphertextBuffer.slice(0, -16)

  let decrypted = decipher.update(actualCiphertext)
  decrypted = Buffer.concat([decrypted, decipher.final()])

  return decrypted.toString('utf8')
}

// 微信支付回调通知
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    console.log('[Wechat Notify] 收到通知:', {
      id: body.id,
      event_type: body.event_type,
      resource_type: body.resource_type,
    })

    // 检查事件类型
    if (body.event_type !== 'TRANSACTION.SUCCESS') {
      console.log('[Wechat Notify] 非支付成功事件:', body.event_type)
      return NextResponse.json({ code: 'SUCCESS', message: '成功' })
    }

    // 解密通知数据
    let decryptedData: any
    try {
      const resource = body.resource
      decryptedData = JSON.parse(
        decryptWechatNotify(resource.ciphertext, resource.nonce, resource.associated_data)
      )
    } catch (err) {
      console.error('[Wechat Notify] 解密失败:', err)
      return NextResponse.json(
        { code: 'FAIL', message: '解密失败' },
        { status: 400 }
      )
    }

    console.log('[Wechat Notify] 解密数据:', {
      out_trade_no: decryptedData.out_trade_no,
      trade_state: decryptedData.trade_state,
      transaction_id: decryptedData.transaction_id,
    })

    const orderNo = decryptedData.out_trade_no
    const tradeState = decryptedData.trade_state
    const transactionId = decryptedData.transaction_id

    if (!orderNo) {
      console.error('[Wechat Notify] 缺少订单号')
      return NextResponse.json(
        { code: 'FAIL', message: '缺少订单号' },
        { status: 400 }
      )
    }

    // 检查订单是否存在
    const order = await getPaymentOrder(orderNo)
    if (!order) {
      console.error('[Wechat Notify] 订单不存在:', orderNo)
      return NextResponse.json(
        { code: 'FAIL', message: '订单不存在' },
        { status: 400 }
      )
    }

    // 处理支付成功
    if (tradeState === 'SUCCESS') {
      const success = await completePayment(orderNo, transactionId)
      if (success) {
        console.log('[Wechat Notify] 支付完成:', orderNo)
        return NextResponse.json({ code: 'SUCCESS', message: '成功' })
      } else {
        console.error('[Wechat Notify] 处理支付失败:', orderNo)
        return NextResponse.json(
          { code: 'FAIL', message: '处理失败' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ code: 'SUCCESS', message: '成功' })
  } catch (error) {
    console.error('[Wechat Notify] 处理异常:', error)
    return NextResponse.json(
      { code: 'FAIL', message: '服务器错误' },
      { status: 500 }
    )
  }
}
