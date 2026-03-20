import type { RechargeOption, PaymentMethod, PaymentStep, RechargeCallbacks } from '@/types/payment'

// 充值选项配置 - 金额单位为分
export const rechargeOptions: RechargeOption[] = [
  { amount: 1000, points: 100, bonus: 0 },           // 10元 = 100积分
  { amount: 3000, points: 300, bonus: 10 },          // 30元 = 300积分 + 10积分赠送
  { amount: 5000, points: 500, bonus: 25 },          // 50元 = 500积分 + 25积分赠送
  { amount: 10000, points: 1000, bonus: 75 },        // 100元 = 1000积分 + 75积分赠送
  { amount: 20000, points: 2000, bonus: 200 },       // 200元 = 2000积分 + 200积分赠送
  { amount: 50000, points: 5000, bonus: 750 },       // 500元 = 5000积分 + 750积分赠送
]

// 汇率：1元 = 10积分
export const EXCHANGE_RATE = 10

// 支付超时时间（毫秒）
export const PAYMENT_TIMEOUT = 15 * 60 * 1000 // 15分钟

// 轮询间隔（毫秒）
export const POLL_INTERVAL = 2000 // 2秒

// 最大轮询次数
export const MAX_POLL_COUNT = 150 // 5分钟内最多轮询150次

// 组件属性类型
export interface AmountSelectorProps {
  selectedAmount: number | null
  onSelect: (amount: number) => void
  disabled?: boolean
}

export interface PaymentMethodSelectorProps {
  selectedMethod: PaymentMethod
  onSelect: (method: PaymentMethod) => void
  disabled?: boolean
}

export interface QRCodeDisplayProps {
  qrCode: string
  amount: number
  onCancel: () => void
  onTimeout: () => void
}

export interface RechargeCardProps extends RechargeCallbacks {
  currentBalance?: number
  className?: string
}

export { PaymentMethod, PaymentStep, RechargeCallbacks }
