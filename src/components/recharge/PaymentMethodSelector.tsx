'use client'

import { memo } from 'react'
import type { PaymentMethod } from '@/types/payment'

interface PaymentMethodSelectorProps {
  selectedMethod: PaymentMethod
  onSelect: (method: PaymentMethod) => void
  disabled?: boolean
}

const PaymentMethodSelector = memo(function PaymentMethodSelector({
  selectedMethod,
  onSelect,
  disabled = false
}: PaymentMethodSelectorProps) {
  const paymentMethods = [
    {
      id: 'alipay' as PaymentMethod,
      name: '支付宝',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21.422 15.358c-3.83-1.153-6.055-1.84-7.373-2.18.471-1.029.838-2.144 1.076-3.322h-4.91v-1.258h5.875V7.34h-5.875V5.5h-2.5v1.84H2.5v1.258h5.215v1.258H2.5v1.258h8.965c-.19.79-.452 1.54-.78 2.24-2.79-.39-5.61.18-5.61 2.39 0 1.69 1.49 2.76 3.77 2.76 1.89 0 3.51-.79 4.65-2.04.93.52 2.04 1.12 3.38 1.82l4.55 2.19V15.36zm-12.27 2.14c-1.29 0-1.89-.52-1.89-1.19 0-.95 1.09-1.42 2.89-1.14-.52.95-1.29 1.71-2.29 2.04-.23.19-.47.29-.71.29z"/>
        </svg>
      ),
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/30',
      borderColor: 'border-blue-500 dark:border-blue-400'
    },
    {
      id: 'wechat' as PaymentMethod,
      name: '微信支付',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.269-.03-.406-.032zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/>
        </svg>
      ),
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/30',
      borderColor: 'border-green-500 dark:border-green-400'
    }
  ]

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">
        支付方式
      </h4>
      <div className="grid grid-cols-2 gap-2">
        {paymentMethods.map((method) => {
          const isSelected = selectedMethod === method.id

          return (
            <button
              key={method.id}
              onClick={() => onSelect(method.id)}
              disabled={disabled}
              className={`
                rounded-lg border p-2 transition-all
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.02]'}
                ${isSelected
                  ? `${method.borderColor} ${method.bgColor}`
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
                }
              `}
            >
              <div className="flex items-center justify-center gap-2">
                <span className={isSelected ? method.color : 'text-slate-400'}>
                  {method.icon}
                </span>
                <span className={`text-sm font-medium ${isSelected ? method.color : 'text-slate-600 dark:text-slate-400'}`}>
                  {method.name}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
})

export default PaymentMethodSelector
