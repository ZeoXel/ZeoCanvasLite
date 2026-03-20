import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: '未授权访问' },
        { status: 401 }
      )
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, short_id, name, phone, balance, created_at, role')
      .eq('id', session.user.id)
      .single()

    if (error) {
      console.error('获取用户信息失败:', error)
      return NextResponse.json(
        { error: '获取用户信息失败' },
        { status: 500 }
      )
    }

    if (!user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: user.id,
      short_id: user.short_id || 'N/A',
      name: user.name || '用户',
      phone: user.phone || '未绑定',
      balance: user.balance || 0,
      hasApiKey: true,
      role: user.role || 'user',
      createdAt: user.created_at ? new Date(user.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
    })
  } catch (error) {
    console.error('获取用户详情API错误:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}
