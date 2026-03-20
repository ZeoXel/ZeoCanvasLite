'use client'

import { memo, useState, useRef, useEffect } from 'react'
import { CheckIcon } from '@heroicons/react/24/outline'
import { rechargeOptions } from './types'

interface AmountSelectorProps {
  selectedAmount: number | null
  onSelect: (amount: number) => void
  disabled?: boolean
}

const AmountSelector = memo(function AmountSelector({
  selectedAmount,
  onSelect,
  disabled = false
}: AmountSelectorProps) {
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customAmount, setCustomAmount] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const formatAmount = (amount: number) => {
    return (amount / 100).toFixed(0)
  }

  // 自动聚焦输入框
  useEffect(() => {
    if (showCustomInput && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showCustomInput])

  // 点击标题激活自定义金额输入
  const handleTitleClick = () => {
    if (!disabled) {
      setShowCustomInput(true)
    }
  }

  const handleCustomAmountSubmit = () => {
    const inputValue = customAmount.trim()
    const amount = inputValue === '' ? 0.01 : parseFloat(inputValue)

    if (amount >= 0.01 && amount <= 10000) {
      onSelect(Math.round(amount * 100))
      setShowCustomInput(false)
      setCustomAmount('')
    }
  }

  return (
    <div className="space-y-3">
      <h4
        className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none"
        onClick={handleTitleClick}
        title="点击可自定义金额"
      >
        选择充值金额
      </h4>

      {/* 自定义金额输入 */}
      {showCustomInput && (
        <div className="flex items-center gap-2 p-2 border rounded-lg bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <span className="text-slate-500 dark:text-slate-400">¥</span>
          <input
            ref={inputRef}
            type="number"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder="输入金额"
            className="flex-1 px-2 py-1 border-0 bg-transparent text-sm focus:ring-0 focus:outline-none text-slate-900 dark:text-slate-100"
            step="0.01"
            min="0.01"
            max="10000"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCustomAmountSubmit()
              if (e.key === 'Escape') setShowCustomInput(false)
            }}
          />
          <button
            onClick={handleCustomAmountSubmit}
            className="p-1 text-blue-600 hover:text-blue-700 transition-colors"
          >
            <CheckIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowCustomInput(false)}
            className="p-1 text-slate-400 hover:text-slate-600 transition-colors text-xs"
          >
            取消
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {rechargeOptions.map((option) => (
          <button
            key={option.amount}
            onClick={() => onSelect(option.amount)}
            disabled={disabled}
            className={`
              relative rounded-lg border p-2 transition-all text-center
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-blue-400'}
              ${selectedAmount === option.amount
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-400'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
              }
            `}
          >
            <div className="flex flex-col items-center">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                ¥{formatAmount(option.amount)}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {option.points}积分
              </div>
              {option.bonus && option.bonus > 0 && (
                <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                  +{option.bonus}赠送
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
})

export default AmountSelector
