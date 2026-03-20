/**
 * 支付服务
 * 负责支付订单的创建、查询、更新等操作
 */

import { supabaseAdmin } from '@/lib/supabase'
import type { PaymentMethod, PaymentStatus } from '@/types/payment'

// 生成订单号
export function generateOrderNo(): string {
  const timestamp = Date.now().toString()
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `PAY${timestamp}${random}`
}

// 创建支付订单
export async function createPaymentOrder(params: {
  userId: string
  amount: number
  points: number
  paymentMethod: PaymentMethod
  description?: string
}): Promise<{ orderNo: string; id: string } | null> {
  const orderNo = generateOrderNo()

  const { data, error } = await supabaseAdmin
    .from('payments')
    .insert({
      user_id: params.userId,
      order_no: orderNo,
      amount: params.amount,
      points: params.points,
      payment_method: params.paymentMethod,
      description: params.description || `充值${params.amount / 100}元`,
      status: 'pending',
    })
    .select('id, order_no')
    .single()

  if (error) {
    console.error('[PaymentService] Create order error:', error)
    return null
  }

  return { orderNo: data.order_no, id: data.id }
}

// 查询支付订单
export async function getPaymentOrder(orderNo: string) {
  const { data, error } = await supabaseAdmin
    .from('payments')
    .select('*')
    .eq('order_no', orderNo)
    .single()

  if (error) {
    console.error('[PaymentService] Get order error:', error)
    return null
  }

  return data
}

// 更新支付订单状态
export async function updatePaymentStatus(
  orderNo: string,
  status: PaymentStatus,
  transactionId?: string
): Promise<boolean> {
  const updateData: Record<string, unknown> = { status }

  if (status === 'paid') {
    updateData.paid_at = new Date().toISOString()
  }

  if (transactionId) {
    updateData.transaction_id = transactionId
  }

  const { error } = await supabaseAdmin
    .from('payments')
    .update(updateData)
    .eq('order_no', orderNo)

  if (error) {
    console.error('[PaymentService] Update status error:', error)
    return false
  }

  return true
}

// 支付完成后更新用户余额
export async function completePayment(orderNo: string, transactionId?: string): Promise<boolean> {
  // 获取订单信息
  const order = await getPaymentOrder(orderNo)
  if (!order) {
    console.error('[PaymentService] Order not found:', orderNo)
    return false
  }

  // 检查订单状态，避免重复处理
  if (order.status === 'paid') {
    console.log('[PaymentService] Order already paid:', orderNo)
    return true
  }

  // 开始事务处理
  try {
    // 1. 更新订单状态
    const statusUpdated = await updatePaymentStatus(orderNo, 'paid', transactionId)
    if (!statusUpdated) {
      throw new Error('Failed to update order status')
    }

    // 2. 更新用户余额
    const { error: balanceError } = await supabaseAdmin.rpc('increment_user_balance', {
      p_user_id: order.user_id,
      p_amount: order.points,
      p_recharge_amount: order.amount / 100, // 转换为元
    })

    if (balanceError) {
      console.error('[PaymentService] Update balance error:', balanceError)
      // 如果没有 RPC 函数，使用直接更新
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('balance, total_recharge_amount')
        .eq('id', order.user_id)
        .single()

      if (user) {
        await supabaseAdmin
          .from('users')
          .update({
            balance: (user.balance || 0) + order.points,
            total_recharge_amount: (user.total_recharge_amount || 0) + order.amount / 100,
          })
          .eq('id', order.user_id)
      }
    }

    // 3. 记录余额变动日志
    await supabaseAdmin.from('balance_logs').insert({
      user_id: order.user_id,
      amount: order.points,
      type: 'recharge',
      description: `充值${order.amount / 100}元，获得${order.points}积分`,
      payment_id: order.id,
    })

    console.log('[PaymentService] Payment completed:', orderNo)
    return true
  } catch (error) {
    console.error('[PaymentService] Complete payment error:', error)
    return false
  }
}

// 获取用户的支付订单列表
export async function getUserPaymentOrders(
  userId: string,
  limit: number = 10,
  status?: PaymentStatus
) {
  let query = supabaseAdmin
    .from('payments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    console.error('[PaymentService] Get user orders error:', error)
    return []
  }

  return data
}

// 检查订单是否过期（15分钟）
export function isOrderExpired(createdAt: string): boolean {
  const created = new Date(createdAt).getTime()
  const now = Date.now()
  const expireTime = 15 * 60 * 1000 // 15分钟
  return now - created > expireTime
}

// 取消过期订单
export async function cancelExpiredOrders(): Promise<number> {
  const expireTime = new Date(Date.now() - 15 * 60 * 1000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('payments')
    .update({ status: 'failed' })
    .eq('status', 'pending')
    .lt('created_at', expireTime)
    .select('id')

  if (error) {
    console.error('[PaymentService] Cancel expired orders error:', error)
    return 0
  }

  return data?.length || 0
}
