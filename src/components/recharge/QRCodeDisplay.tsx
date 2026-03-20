'use client'

import { memo, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline'

interface QRCodeDisplayProps {
  qrCode: string
  amount: number
  orderNo: string
  paymentMethod: 'wechat' | 'alipay'
  onCancel: () => void
  onRefresh?: () => void
  isRefreshing?: boolean
}

const QRCodeDisplay = memo(function QRCodeDisplay({
  qrCode,
  amount,
  orderNo,
  paymentMethod,
  onCancel,
  onRefresh,
  isRefreshing = false
}: QRCodeDisplayProps) {
  const [countdown, setCountdown] = useState(15 * 60) // 15分钟

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const methodName = paymentMethod === 'wechat' ? '微信' : '支付宝'

  return (
    <div className="text-center space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {methodName}扫码支付
        </h4>
        <button
          onClick={onCancel}
          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="flex justify-center">
        <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200">
          {qrCode ? (
            <QRCodeSVG
              value={qrCode}
              size={140}
              level="M"
              includeMargin={false}
            />
          ) : (
            <div className="w-[140px] h-[140px] bg-slate-100 rounded flex items-center justify-center">
              <span className="text-slate-400 text-xs">加载中...</span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          ¥{(amount / 100).toFixed(2)}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          订单号：{orderNo.slice(-8)}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 text-xs">
        <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${countdown > 0 ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-slate-600 dark:text-slate-400">
          {countdown > 0 ? `剩余 ${formatCountdown(countdown)}` : '已超时'}
        </span>
      </div>

      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center justify-center gap-1 text-blue-600 hover:text-blue-700 text-xs mx-auto disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? '刷新中...' : '刷新二维码'}</span>
        </button>
      )}
    </div>
  )
})

export default QRCodeDisplay
