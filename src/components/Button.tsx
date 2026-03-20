import React from 'react'
import Link from 'next/link'
import clsx from 'clsx'

const baseStyles = {
  solid:
    'group inline-flex items-center justify-center rounded-full py-2 px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2',
  outline:
    'group inline-flex ring-1 items-center justify-center rounded-full py-2 px-4 text-sm',
}

const variantStyles = {
  solid: {
    slate:
      'bg-slate-900 text-white hover:bg-slate-700 hover:text-slate-100 active:bg-slate-800 active:text-slate-300 focus-visible:outline-slate-900',
    blue: 'bg-blue-600 text-white hover:text-slate-100 hover:bg-blue-500 active:bg-blue-800 active:text-blue-100 focus-visible:outline-blue-600',
    white:
      'bg-white text-slate-900 hover:bg-blue-50 active:bg-blue-200 active:text-slate-600 focus-visible:outline-white',
  },
  outline: {
    slate:
      'ring-slate-200 text-slate-700 hover:text-slate-900 hover:ring-slate-300 active:bg-slate-100 active:text-slate-600 focus-visible:outline-blue-600 focus-visible:ring-slate-300',
    white:
      'ring-slate-700 text-white hover:ring-slate-500 active:ring-slate-700 active:text-slate-400 focus-visible:outline-white',
  },
}

type ButtonProps = (
  | {
      variant?: 'solid'
      color?: keyof typeof variantStyles.solid
    }
  | {
      variant: 'outline'
      color?: keyof typeof variantStyles.outline
    }
) &
  (
    | Omit<React.ComponentPropsWithoutRef<typeof Link>, 'color'>
    | (Omit<React.ComponentPropsWithoutRef<'button'>, 'color'> & {
        href?: undefined
      })
  )

export function Button({ className, ...props }: ButtonProps) {
  props.variant ??= 'solid'
  props.color ??= 'slate'

  const finalClassName = clsx(
    baseStyles[props.variant],
    props.variant === 'outline'
      ? variantStyles.outline[props.color]
      : props.variant === 'solid'
        ? variantStyles.solid[props.color]
        : undefined,
    className,
  )

  if (typeof props.href === 'undefined') {
    const buttonProps = props as React.ButtonHTMLAttributes<HTMLButtonElement>
    const { disabled, onClick, style, ...restProps } = buttonProps

    // iOS Safari兼容性: 使用pointer-events而不是仅依赖disabled属性
    const iosCompatibleStyle = {
      ...style,
      ...(disabled && { pointerEvents: 'none' as const })
    }

    // iOS Safari兼容性: 在disabled时阻止onClick执行
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      onClick?.(e)
    }

    return (
      <button
        {...restProps}
        onClick={handleClick}
        style={iosCompatibleStyle}
        className={clsx(
          finalClassName,
          disabled && 'opacity-60 cursor-not-allowed'
        )}
        disabled={disabled}
        aria-disabled={disabled}
      />
    )
  }

  return <Link className={finalClassName} {...props} />
}
