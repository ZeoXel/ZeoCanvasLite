'use client'

import { useState, useEffect, useCallback } from 'react'
import { POLL_INTERVAL, MAX_POLL_COUNT } from '@/components/recharge/types'

interface UseRechargeOptions {
  onSuccess?: (orderNo: string, amount: number, points: number) => void
  onError?: (error: string) => void
}

interface RechargeState {
  isPolling: boolean
  orderNo: string | null
  error: string | null
}

export function useRecharge(options: UseRechargeOptions = {}) {
  const { onSuccess, onError } = options
  const [state, setState] = useState<RechargeState>({
    isPolling: false,
    orderNo: null,
    error: null,
  })

  // 监听支付结果页的消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PAYMENT_SUCCESS' && event.data?.orderNo) {
        // 支付成功，查询订单详情
        checkOrderAndNotify(event.data.orderNo)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // 查询订单并通知
  const checkOrderAndNotify = useCallback(async (orderNo: string) => {
    try {
      const res = await fetch(`/api/payment/order-status/${orderNo}`)
      const data = await res.json()

      if (data.success && data.data.status === 'paid') {
        onSuccess?.(orderNo, data.data.amount, data.data.points)
      }
    } catch (err) {
      console.error('查询订单失败:', err)
    }
  }, [onSuccess])

  // 开始轮询订单状态
  const startPolling = useCallback((orderNo: string) => {
    setState({ isPolling: true, orderNo, error: null })

    let pollCount = 0

    const poll = async () => {
      if (pollCount >= MAX_POLL_COUNT) {
        setState(prev => ({
          ...prev,
          isPolling: false,
          error: '支付超时，请检查支付状态',
        }))
        onError?.('支付超时')
        return
      }

      try {
        const res = await fetch(`/api/payment/order-status/${orderNo}`)
        const data = await res.json()

        if (data.success && data.data.status === 'paid') {
          setState({ isPolling: false, orderNo: null, error: null })
          onSuccess?.(orderNo, data.data.amount, data.data.points)
          return
        }

        if (data.success && data.data.status === 'failed') {
          setState(prev => ({
            ...prev,
            isPolling: false,
            error: '支付失败',
          }))
          onError?.('支付失败')
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
  }, [onSuccess, onError])

  // 停止轮询
  const stopPolling = useCallback(() => {
    setState({ isPolling: false, orderNo: null, error: null })
  }, [])

  // 清除错误
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }))
  }, [])

  return {
    ...state,
    startPolling,
    stopPolling,
    clearError,
  }
}
