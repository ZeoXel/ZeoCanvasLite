'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Suspense } from 'react'

function SSOHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    const token = searchParams.get('token')
    if (!token) {
      router.replace('/auth')
      return
    }

    signIn('sso', { token, redirect: false }).then((result) => {
      if (result?.ok) {
        router.replace('/')
      } else {
        router.replace('/auth')
      }
    })
  }, [router, searchParams])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center text-gray-500 text-sm">登录中...</div>
    </div>
  )
}

export default function SSOPage() {
  return (
    <Suspense>
      <SSOHandler />
    </Suspense>
  )
}
