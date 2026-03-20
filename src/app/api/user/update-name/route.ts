import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: '未授权访问',
          code: 'UNAUTHORIZED'
        },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: '用户名格式无效',
          code: 'INVALID_FORMAT'
        },
        { status: 400 }
      )
    }

    const trimmedName = name.trim()

    if (trimmedName.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '用户名不能为空',
          code: 'EMPTY_NAME'
        },
        { status: 400 }
      )
    }

    if (trimmedName.length < 2) {
      return NextResponse.json(
        {
          success: false,
          error: '用户名长度至少2个字符',
          code: 'NAME_TOO_SHORT'
        },
        { status: 400 }
      )
    }

    if (trimmedName.length > 50) {
      return NextResponse.json(
        {
          success: false,
          error: '用户名长度不能超过50个字符',
          code: 'NAME_TOO_LONG'
        },
        { status: 400 }
      )
    }

    const invalidChars = /[<>"'&;]/
    if (invalidChars.test(trimmedName)) {
      return NextResponse.json(
        {
          success: false,
          error: '用户名包含非法字符',
          code: 'INVALID_CHARACTERS'
        },
        { status: 400 }
      )
    }

    const { data: existingUser, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, name')
      .eq('id', session.user.id)
      .single()

    if (fetchError || !existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: '用户不存在',
          code: 'USER_NOT_FOUND'
        },
        { status: 404 }
      )
    }

    if (existingUser.name === trimmedName) {
      return NextResponse.json({
        success: true,
        message: '用户名无需更新',
        name: trimmedName,
        updated: false
      })
    }

    const { data: updatedData, error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        name: trimmedName,
        updated_at: new Date().toISOString()
      })
      .eq('id', session.user.id)
      .select('name, updated_at')
      .single()

    if (updateError) {
      console.error('更新用户名失败:', updateError)
      return NextResponse.json(
        {
          success: false,
          error: '数据库更新失败',
          code: 'DATABASE_ERROR'
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '用户名更新成功',
      name: updatedData.name,
      updated: true,
      updatedAt: updatedData.updated_at
    })
  } catch (error) {
    console.error('更新用户名API错误:', error)

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          success: false,
          error: '请求数据格式错误',
          code: 'INVALID_JSON'
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: '服务器内部错误',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    )
  }
}
