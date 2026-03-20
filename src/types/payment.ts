/**
 * 支付相关类型定义
 */

export type PaymentMethod = 'wechat' | 'alipay'

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled'

export interface PaymentOrder {
  orderNo: string
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  createdAt: string
  expiredAt: string
  qrCode?: string
  redirectUrl?: string
}

export interface RechargeRequest {
  amount: number
  method: PaymentMethod
  userId: string
}

export interface PaymentNotification {
  orderNo: string
  status: PaymentStatus
  paidAmount?: number
  paidAt?: string
  transactionId?: string
}

export interface PaymentConfig {
  wechat: {
    appId: string
    merchantId: string
    apiKey: string
    notifyUrl: string
  }
  alipay: {
    appId: string
    privateKey: string
    publicKey: string
    notifyUrl: string
    returnUrl: string
  }
}

// 充值选项配置
export interface RechargeOption {
  amount: number      // 金额（分）
  points: number      // 充值积分
  bonus?: number      // 赠送积分
  popular?: boolean   // 是否推荐
}

// 支付流程状态
export type PaymentStep = 'select' | 'paying' | 'waiting'

// 充值回调属性
export interface RechargeCallbacks {
  onSuccess?: (orderNo: string, amount: number) => void
  onPaymentStatusChange?: (status: 'pending' | 'success' | 'failed', orderNo?: string) => void
}
