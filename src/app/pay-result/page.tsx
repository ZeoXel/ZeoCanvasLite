'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { CheckCircleIcon, XCircleIcon, ClockIcon } from '@heroicons/react/24/outline'

type PaymentStatus = 'loading' | 'success' | 'pending' | 'failed' | 'error'

interface OrderInfo {
  status: string
  amount: number
  points: number
  order_no: string
  pay_type: string
}

function PayResultContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const orderNo = searchParams.get('orderNo')

  const [status, setStatus] = useState<PaymentStatus>('loading')
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null)
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    if (!orderNo) {
      setStatus('error')
      return
    }

    const checkOrderStatus = async () => {
      try {
        const res = await fetch(`/api/payment/order-status/${orderNo}`)
        const data = await res.json()

        if (data.success) {
          setOrderInfo(data.data)
          if (data.data.status === 'paid') {
            setStatus('success')
          } else if (data.data.status === 'pending') {
            setStatus('pending')
          } else {
            setStatus('failed')
          }
        } else {
          setStatus('error')
        }
      } catch (err) {
        console.error('查询订单状态失败:', err)
        setStatus('error')
      }
    }

    checkOrderStatus()
  }, [orderNo])

  // 成功后倒计时跳转
  useEffect(() => {
    if (status === 'success' && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    } else if (status === 'success' && countdown === 0) {
      // 通知父窗口并关闭
      if (window.opener) {
        window.opener.postMessage({ type: 'PAYMENT_SUCCESS', orderNo }, '*')
        window.close()
      } else {
        router.push('/')
      }
    }
  }, [status, countdown, orderNo, router])

  const getStatusIcon = () => {
    switch (status) {
      case 'success':
        return <CheckCircleIcon className="w-16 h-16 text-green-500" />
      case 'pending':
        return <ClockIcon className="w-16 h-16 text-yellow-500" />
      case 'failed':
      case 'error':
        return <XCircleIcon className="w-16 h-16 text-red-500" />
      default:
        return (
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        )
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'loading':
        return '正在查询支付结果...'
      case 'success':
        return '支付成功'
      case 'pending':
        return '等待支付'
      case 'failed':
        return '支付失败'
      case 'error':
        return '查询失败'
    }
  }

  const getStatusDescription = () => {
    switch (status) {
      case 'success':
        return `已成功充值 ${orderInfo?.points || 0} 积分`
      case 'pending':
        return '订单正在处理中，请稍候...'
      case 'failed':
        return '支付未完成，请重试'
      case 'error':
        return '无法获取订单信息'
      default:
        return ''
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center space-y-6">
        {/* 状态图标 */}
        <div className="flex justify-center">{getStatusIcon()}</div>

        {/* 状态文字 */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {getStatusText()}
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            {getStatusDescription()}
          </p>
        </div>

        {/* 订单信息 */}
        {orderInfo && status !== 'loading' && (
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">订单号</span>
              <span className="text-slate-900 dark:text-slate-100 font-mono">
                {orderInfo.order_no.slice(-12)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">支付金额</span>
              <span className="text-slate-900 dark:text-slate-100">
                ¥{(orderInfo.amount / 100).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">获得积分</span>
              <span className="text-blue-600 dark:text-blue-400 font-semibold">
                {orderInfo.points}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">支付方式</span>
              <span className="text-slate-900 dark:text-slate-100">
                {orderInfo.pay_type === 'alipay' ? '支付宝' : '微信支付'}
              </span>
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="space-y-3">
          {status === 'success' && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {countdown > 0 ? `${countdown} 秒后自动关闭...` : '正在跳转...'}
            </p>
          )}

          {status === 'pending' && (
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              刷新状态
            </button>
          )}

          {(status === 'failed' || status === 'error') && (
            <button
              onClick={() => {
                if (window.opener) {
                  window.close()
                } else {
                  router.push('/')
                }
              }}
              className="w-full py-2.5 bg-slate-500 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              返回
            </button>
          )}

          {status === 'success' && (
            <button
              onClick={() => {
                if (window.opener) {
                  window.opener.postMessage({ type: 'PAYMENT_SUCCESS', orderNo }, '*')
                  window.close()
                } else {
                  router.push('/')
                }
              }}
              className="w-full py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
            >
              完成
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PayResultPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PayResultContent />
    </Suspense>
  )
}
