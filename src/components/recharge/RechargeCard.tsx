'use client'

import { useState, useCallback } from 'react'
import { CreditCardIcon } from '@heroicons/react/24/outline'
import AmountSelector from './AmountSelector'
import PaymentMethodSelector from './PaymentMethodSelector'
import QRCodeDisplay from './QRCodeDisplay'
import type { PaymentMethod, PaymentStep } from '@/types/payment'
import { rechargeOptions, POLL_INTERVAL, MAX_POLL_COUNT } from './types'

interface RechargeCardProps {
  currentBalance?: number
  className?: string
  onSuccess?: (orderNo: string, amount: number) => void
}

export default function RechargeCard({
  currentBalance = 0,
  className = '',
  onSuccess
}: RechargeCardProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(rechargeOptions[3].amount) // 默认100元
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('alipay')
  const [step, setStep] = useState<PaymentStep>('select')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orderNo, setOrderNo] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)

  // 检测是否为移动端
  const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  // 获取选中金额对应的积分
  const getSelectedPoints = () => {
    if (!selectedAmount) return 0
    const option = rechargeOptions.find(opt => opt.amount === selectedAmount)
    return option ? option.points + (option.bonus || 0) : Math.floor(selectedAmount / 10)
  }

  // 轮询订单状态
  const pollOrderStatus = useCallback(async (orderNo: string) => {
    let pollCount = 0

    const poll = async () => {
      if (pollCount >= MAX_POLL_COUNT) {
        setError('支付超时，请重试')
        setStep('select')
        return
      }

      try {
        const res = await fetch(`/api/payment/order-status/${orderNo}`)
        const data = await res.json()

        if (data.success && data.data.status === 'paid') {
          setStep('select')
          setOrderNo(null)
          setQrCode(null)
          onSuccess?.(orderNo, data.data.amount)
          return
        }

        pollCount++
        setTimeout(poll, POLL_INTERVAL)
      } catch (err) {
        console.error('轮询订单状态失败:', err)
        pollCount++
        setTimeout(poll, POLL_INTERVAL)
      }
    }

    poll()
  }, [onSuccess])

  // 发起支付
  const handlePay = async () => {
    if (!selectedAmount) {
      setError('请选择充值金额')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 根据支付方式和设备类型选择接口
      let apiUrl = '/api/payment/alipay'
      if (paymentMethod === 'wechat') {
        apiUrl = '/api/payment/wechat'
      } else if (isMobile) {
        apiUrl = '/api/payment/alipay/wap'
      }

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: selectedAmount }),
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || data.message || '支付请求失败')
      }

      setOrderNo(data.data.order_no)

      // 微信支付：显示二维码
      if (paymentMethod === 'wechat') {
        setQrCode(data.data.qr_code)
        setStep('paying')
        pollOrderStatus(data.data.order_no)
      }
      // 支付宝PC：新窗口打开
      else if (!isMobile && data.data.payment_form) {
        // 创建临时表单提交
        const div = document.createElement('div')
        div.innerHTML = data.data.payment_form
        document.body.appendChild(div)
        const form = div.querySelector('form')
        if (form) {
          form.target = '_blank'
          form.submit()
        }
        document.body.removeChild(div)

        setStep('waiting')
        pollOrderStatus(data.data.order_no)
      }
      // 支付宝WAP：当前窗口跳转
      else if (isMobile && data.data.payment_form) {
        const div = document.createElement('div')
        div.innerHTML = data.data.payment_form
        document.body.appendChild(div)
        const form = div.querySelector('form')
        if (form) {
          form.submit()
        }
      }
    } catch (err) {
      console.error('支付失败:', err)
      setError(err instanceof Error ? err.message : '支付请求失败')
    } finally {
      setLoading(false)
    }
  }

  // 取消支付
  const handleCancel = () => {
    setStep('select')
    setOrderNo(null)
    setQrCode(null)
    setError(null)
  }

  return (
    <div className={`p-4 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg border border-blue-200 dark:border-blue-800 ${className}`}>
      {/* 标题和余额 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CreditCardIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
            账户充值
          </span>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500 dark:text-slate-400">当前余额</div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {currentBalance.toLocaleString()} 积分
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* 支付二维码显示 */}
      {step === 'paying' && qrCode && orderNo && (
        <QRCodeDisplay
          qrCode={qrCode}
          amount={selectedAmount || 0}
          orderNo={orderNo}
          paymentMethod={paymentMethod}
          onCancel={handleCancel}
        />
      )}

      {/* 等待支付确认 */}
      {step === 'waiting' && (
        <div className="text-center py-6 space-y-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-sm text-slate-600 dark:text-slate-400">
            等待支付确认...
          </div>
          <button
            onClick={handleCancel}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            取消
          </button>
        </div>
      )}

      {/* 选择金额和支付方式 */}
      {step === 'select' && (
        <div className="space-y-4">
          <AmountSelector
            selectedAmount={selectedAmount}
            onSelect={setSelectedAmount}
            disabled={loading}
          />

          <PaymentMethodSelector
            selectedMethod={paymentMethod}
            onSelect={setPaymentMethod}
            disabled={loading}
          />

          {/* 充值按钮 */}
          <button
            onClick={handlePay}
            disabled={loading || !selectedAmount}
            className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                处理中...
              </span>
            ) : (
              `立即充值 ¥${selectedAmount ? (selectedAmount / 100).toFixed(0) : 0} → ${getSelectedPoints()}积分`
            )}
          </button>

          <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">
            充值即表示同意服务条款，积分不可退款
          </p>
        </div>
      )}
    </div>
  )
}
