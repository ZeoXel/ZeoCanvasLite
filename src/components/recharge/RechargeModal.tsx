'use client'

import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogPanel, DialogTitle, DialogBackdrop } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { QRCodeSVG } from 'qrcode.react'
import AmountSelector from './AmountSelector'
import PaymentMethodSelector from './PaymentMethodSelector'
import { rechargeOptions, POLL_INTERVAL } from './types'
import type { PaymentMethod, PaymentStep } from '@/types/payment'

interface RechargeModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (orderNo: string, amount: number) => void
}

export default function RechargeModal({
  isOpen,
  onClose,
  onSuccess
}: RechargeModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number>(rechargeOptions[3].amount)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('alipay')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string>('')
  const [currentOrderNo, setCurrentOrderNo] = useState<string>('')
  const [paymentStep, setPaymentStep] = useState<PaymentStep>('select')
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('')
  const [pollingTimer, setPollingTimer] = useState<NodeJS.Timeout | null>(null)

  const selectedOption = rechargeOptions.find(opt => opt.amount === selectedAmount)
  const totalPoints = selectedOption
    ? selectedOption.points + (selectedOption.bonus || 0)
    : Math.floor((selectedAmount / 100) * 10)

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollingTimer) clearInterval(pollingTimer)
    }
  }, [pollingTimer])

  // 监听支付成功消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PAYMENT_SUCCESS') {
        handlePaymentSuccess(event.data.orderNo)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handlePaymentSuccess = useCallback((orderNo: string) => {
    if (pollingTimer) {
      clearInterval(pollingTimer)
      setPollingTimer(null)
    }
    onSuccess?.(orderNo, selectedAmount)
    resetState()
    onClose()
  }, [pollingTimer, selectedAmount, onSuccess, onClose])

  // 轮询支付状态
  const pollPaymentStatus = useCallback((orderNo: string) => {
    let count = 0
    const maxCount = 100 // 约5分钟

    const timer = setInterval(async () => {
      if (count >= maxCount) {
        clearInterval(timer)
        setPollingTimer(null)
        return
      }

      try {
        const res = await fetch(`/api/payment/order-status/${orderNo}`)
        const data = await res.json()

        if (data.success && data.data.status === 'paid') {
          handlePaymentSuccess(orderNo)
        } else if (data.data?.status === 'failed') {
          clearInterval(timer)
          setPollingTimer(null)
          setError('支付失败，请重试')
          setPaymentStep('select')
        }
      } catch (err) {
        console.error('轮询失败:', err)
      }

      count++
    }, POLL_INTERVAL)

    setPollingTimer(timer)
  }, [handlePaymentSuccess])

  const handlePayment = async () => {
    if (!selectedAmount || selectedAmount < 1) return

    setIsProcessing(true)
    setError('')
    setPaymentStep('paying')

    try {
      const endpoint = paymentMethod === 'alipay'
        ? '/api/payment/alipay'
        : '/api/payment/wechat'

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: selectedAmount })
      })

      const result = await res.json()

      if (!res.ok || !result.success) {
        throw new Error(result.message || result.error || '支付请求失败')
      }

      const orderNo = result.data.order_no
      setCurrentOrderNo(orderNo)

      // 支付宝和微信都使用二维码
      setQrCodeUrl(result.data.qr_code)
      setPaymentStep('waiting')
      pollPaymentStatus(orderNo)
    } catch (err) {
      console.error('支付失败:', err)
      setError(err instanceof Error ? err.message : '支付请求失败')
      setPaymentStep('select')
    } finally {
      setIsProcessing(false)
    }
  }

  const resetState = () => {
    setPaymentStep('select')
    setCurrentOrderNo('')
    setQrCodeUrl('')
    setError('')
    if (pollingTimer) {
      clearInterval(pollingTimer)
      setPollingTimer(null)
    }
  }

  const handleClose = () => {
    resetState()
    onClose()
  }

  return (
    <Dialog open={isOpen} onClose={handleClose} className="relative z-[110]">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 data-[closed]:opacity-0"
      />

      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel
            transition
            className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-xl transition-all duration-300 data-[closed]:opacity-0 data-[closed]:scale-95"
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between mb-5">
              <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {paymentStep === 'select' && '充值积分'}
                {paymentStep === 'paying' && '正在创建订单...'}
                {paymentStep === 'waiting' && '等待支付'}
              </DialogTitle>
              <button
                onClick={handleClose}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* 选择金额和支付方式 */}
            {paymentStep === 'select' && (
              <div className="space-y-5">
                <AmountSelector
                  selectedAmount={selectedAmount}
                  onSelect={setSelectedAmount}
                  disabled={isProcessing}
                />

                <PaymentMethodSelector
                  selectedMethod={paymentMethod}
                  onSelect={setPaymentMethod}
                  disabled={isProcessing}
                />

                {/* 支付按钮 */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      总计: {totalPoints.toLocaleString()} 积分
                    </div>
                    <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      ¥{(selectedAmount / 100).toFixed(2)}
                    </div>
                  </div>
                  <button
                    onClick={handlePayment}
                    disabled={isProcessing}
                    className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? '处理中...' : '立即支付'}
                  </button>
                </div>
              </div>
            )}

            {/* 二维码支付 - 支付宝和微信统一显示 */}
            {paymentStep === 'waiting' && qrCodeUrl && (
              <div className="text-center space-y-4">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  请使用{paymentMethod === 'alipay' ? '支付宝' : '微信'}扫码支付
                </p>
                <div className="flex justify-center">
                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    <QRCodeSVG value={qrCodeUrl} size={200} level="M" />
                  </div>
                </div>
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  ¥{(selectedAmount / 100).toFixed(2)}
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  等待支付中...
                </div>
                <p className="text-xs text-slate-400">订单号: {currentOrderNo.slice(-12)}</p>
                <button
                  onClick={resetState}
                  className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  取消支付
                </button>
              </div>
            )}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
