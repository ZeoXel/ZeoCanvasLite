import { supabaseAdmin } from '@/lib/supabase'
import { Database } from '@/lib/supabase'

type User = Database['public']['Tables']['users']['Row']
type CreateUserData = Database['public']['Tables']['users']['Insert']
type UpdateUserData = Database['public']['Tables']['users']['Update']

export class UserService {
  // 生成新用户名称（格式：新用户USER0001）
  static async generateNewUserName(): Promise<string> {
    try {
      // 获取当前用户总数
      const count = await this.getUserCount()
      // 生成格式化的ID，确保4位数字
      const formattedId = String(count + 1).padStart(4, '0')
      return `新用户USER${formattedId}`
    } catch (error) {
      // 如果获取失败，使用时间戳作为备选
      const timestamp = Date.now().toString().slice(-4)
      return `新用户USER${timestamp}`
    }
  }

  // 获取所有用户
  static async getAllUsers(): Promise<User[]> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error('获取用户列表失败')
    }

    return data || []
  }

  // 获取用户显示视图（包含友好短ID）
  static async getAllUsersWithDisplay(): Promise<any[]> {
    const { data, error } = await supabaseAdmin
      .from('user_display')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error('获取用户显示列表失败')
    }

    return data || []
  }

  // 根据ID获取用户
  static async getUserById(id: string): Promise<User | null> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // 用户不存在
      }
      throw new Error('获取用户失败')
    }

    return data
  }

  // 根据手机号获取用户
  static async getUserByPhone(phone: string): Promise<User | null> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('phone', phone)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // 用户不存在
      }
      throw new Error('获取用户失败')
    }

    return data
  }

  // 根据短ID获取用户
  static async getUserByShortId(shortId: string): Promise<User | null> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('short_id', shortId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // 用户不存在
      }
      throw new Error('获取用户失败')
    }

    return data
  }

  // 创建用户
  static async createUser(userData: CreateUserData): Promise<User> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .insert(userData)
      .select()
      .single()

    if (error) {
      throw new Error('创建用户失败')
    }

    return data
  }

  // 更新用户信息
  static async updateUser(id: string, userData: UpdateUserData): Promise<User> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .update(userData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error('更新用户失败')
    }

    return data
  }

  // 更新用户余额
  static async updateUserBalance(userId: string, balance: number): Promise<User> {
    return this.updateUser(userId, { balance })
  }

  // 更新用户角色
  static async updateUserRole(userId: string, role: 'user' | 'admin' | 'super_admin'): Promise<User> {
    return this.updateUser(userId, { role })
  }

  // 根据手机号更新用户角色
  static async updateUserRoleByPhone(phone: string, role: 'user' | 'admin' | 'super_admin'): Promise<User> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ role })
      .eq('phone', phone)
      .select()
      .single()

    if (error) {
      throw new Error('更新用户角色失败')
    }

    return data
  }

  // 删除用户
  static async deleteUser(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', id)

    if (error) {
      throw new Error('删除用户失败')
    }
  }

  // 验证用户权限
  static async verifyUserPermission(userId: string, requiredRole: 'user' | 'admin' | 'super_admin'): Promise<boolean> {
    const user = await this.getUserById(userId)
    if (!user) return false

    const rolePriority = { user: 1, admin: 2, super_admin: 3 }
    return rolePriority[user.role] >= rolePriority[requiredRole]
  }

  // 检查用户是否为超级管理员
  static async isSuperAdmin(userId: string): Promise<boolean> {
    const user = await this.getUserById(userId)
    return user?.role === 'super_admin'
  }

  // 统计用户数量
  static async getUserCount(): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })

    if (error) {
      return 0
    }

    return count || 0
  }

  // 按角色统计用户
  static async getUserCountByRole(): Promise<Record<string, number>> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('role')

    if (error) {
      return {}
    }

    const counts: Record<string, number> = { user: 0, admin: 0, super_admin: 0 }
    data.forEach((user: any) => {
      counts[user.role] = (counts[user.role] || 0) + 1
    })

    return counts
  }

  // 直接更新用户的总充值金额（用于测试和管理）
  static async updateUserTotalRechargeAmount(userId: string, amount: number): Promise<User> {
    if (amount < 0) {
      throw new Error('充值金额不能为负数')
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ total_recharge_amount: amount })
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      throw new Error(`更新用户总充值金额失败: ${error.message}`)
    }

    console.log('✅ 直接更新用户总充值金额:', {
      userId,
      newAmount: amount,
      message: '金额更新成功'
    })

    return data
  }
}