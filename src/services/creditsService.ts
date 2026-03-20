/**
 * 积分系统服务
 * 负责积分余额、消耗统计、交易记录等数据的获取和管理
 */

import { getUserInfo } from './userApiService';
import { getUsageDetail, getRecentDaysRange, getUsageLogs, type ConsumptionLog } from './gatewayUsageService';
import type {
  CreditBalance,
  CreditUsageStats,
  CreditTransaction,
  CreditInfo,
} from '@/types/credits';

/**
 * 从USERAPI获取积分余额
 */
export const getCreditBalance = async (): Promise<CreditBalance> => {
  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('/api/user/balance', {
        method: 'GET',
        credentials: 'include', // 确保发送 cookies
      });

      if (!response.ok) {
        // 如果是 401 且不是最后一次尝试，等待后重试
        if (response.status === 401 && attempt < maxRetries) {
          console.log(`[getCreditBalance] 401 error, retrying (${attempt + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          continue;
        }
        throw new Error('Failed to fetch balance');
      }

      const result = await response.json();
      if (!result?.success || !result?.data) {
        throw new Error('Invalid balance response');
      }

      const total = Math.round((result.data.totalRecharge || 0) * 10);
      const used = Math.round((result.data.apiConsumption || 0) * 10);
      const remaining = Number(result.data.currentBalance || 0);

      return {
        total,
        used,
        remaining,
        locked: 0,
      };
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        console.log(`[getCreditBalance] Error on attempt ${attempt + 1}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }

  console.error('Error fetching credit balance after retries:', lastError);
  // 失败时回退到从用户信息获取
  return getCreditBalanceFromUserInfo();
};

/**
 * 从用户信息中提取积分余额（回退方案）
 */
const getCreditBalanceFromUserInfo = async (): Promise<CreditBalance> => {
  const userInfo = await getUserInfo();

  if (!userInfo) {
    return {
      total: 0,
      used: 0,
      remaining: 0,
      locked: 0,
    };
  }
  const balanceValue = userInfo.balance || 0;
  return {
    total: balanceValue,
    used: 0,
    remaining: balanceValue,
    locked: 0,
  };
};

/**
 * 获取积分使用统计
 * 从网关获取真实的消费数据
 */
export const getCreditUsageStats = async (): Promise<CreditUsageStats> => {
  try {
    // 获取最近30天的数据
    const { start, end } = getRecentDaysRange(30);
    const usageDetail = await getUsageDetail(start, end);

    console.log('[getCreditUsageStats] Usage detail response:', usageDetail);

    if (!usageDetail.success) {
      throw new Error('Failed to fetch usage detail');
    }

    // 安全地访问数据，提供默认值
    const summary = usageDetail.summary || {
      totalQuota: 0,
      totalAmount: 0,
      totalRequests: 0,
      totalTokens: 0,
      avgLatency: 0,
    };

    const byModel = usageDetail.byModel || [];
    const byDate = usageDetail.byDate || [];

    // 计算今日消耗
    const today = new Date().toISOString().split('T')[0];
    const todayData = byDate.find(d => d.date === today);

    // 计算最近7天消耗
    const last7Days = byDate.slice(-7);
    const last7DaysConsumption = last7Days.reduce((sum, d) => sum + (d.quota || 0), 0);
    const last7DaysTransactions = last7Days.reduce((sum, d) => sum + (d.requests || 0), 0);

    // 计算最近30天消耗
    const last30DaysConsumption = summary.totalQuota || 0;
    const last30DaysTransactions = summary.totalRequests || 0;

    // 按模型分组（直接使用 byModel 数据，不再按厂商聚合）
    const byProvider = byModel.map((m, index) => ({
      provider: m.model,  // 使用模型名称作为 key
      consumption: m.quota || 0,
      transactions: m.requests || 0,
      percentage: summary.totalQuota > 0 ? Math.round(((m.quota || 0) / summary.totalQuota) * 100) : 0,
    }));

    return {
      today: {
        consumption: todayData?.quota || 0,
        transactions: todayData?.requests || 0,
      },
      last7Days: {
        consumption: last7DaysConsumption,
        transactions: last7DaysTransactions,
        daily: last7Days.map(d => ({
          date: d.date,
          consumption: d.quota || 0,
          transactions: d.requests || 0,
        })),
      },
      last30Days: {
        consumption: last30DaysConsumption,
        transactions: last30DaysTransactions,
        byProvider,
      },
    };
  } catch (error) {
    console.error('Error fetching credit usage stats:', error);
    // 返回空数据
    return {
      today: { consumption: 0, transactions: 0 },
      last7Days: {
        consumption: 0,
        transactions: 0,
        daily: [],
      },
      last30Days: {
        consumption: 0,
        transactions: 0,
        byProvider: [],
      },
    };
  }
};

/**
 * 从模型名称提取提供商
 */
function extractProviderFromModel(model: string): string {
  if (model.includes('gpt') || model.includes('openai')) return 'OpenAI';
  if (model.includes('claude')) return 'Anthropic';
  if (model.includes('gemini')) return 'Google';
  if (model.includes('vidu')) return 'Vidu';
  if (model.includes('seedream') || model.includes('doubao')) return 'Volcengine';
  if (model.includes('nano-banana')) return 'Nano Banana';
  if (model.includes('suno')) return 'Suno';
  if (model.includes('minimax')) return 'Minimax';
  return 'Other';
}

/**
 * 获取最近的积分交易记录
 * 从网关获取真实的消费日志
 *
 * @param limit 返回记录数量，默认10条
 * @param type 可选过滤类型: consumption, recharge, refund, reward
 */
export const getRecentTransactions = async (
  limit: number = 10,
  type?: string
): Promise<CreditTransaction[]> => {
  try {
    // 获取最近30天的数据
    const { start, end } = getRecentDaysRange(30);
    let recentLogs: ConsumptionLog[] = [];

    try {
      const usageDetail = await getUsageDetail(start, end);
      console.log('[getRecentTransactions] Usage detail response:', usageDetail);
      if (usageDetail.success) {
        recentLogs = usageDetail.recentLogs || [];
      }
    } catch (error) {
      console.warn('[getRecentTransactions] Failed to fetch usage detail, falling back to logs:', error);
    }

    if (recentLogs.length === 0) {
      try {
        const logsResponse = await getUsageLogs(start, end, undefined, 1, limit);
        recentLogs = logsResponse.logs || [];
      } catch (error) {
        console.error('[getRecentTransactions] Failed to fetch usage logs:', error);
      }
    }

    if (recentLogs.length === 0) {
      console.log('[getRecentTransactions] No recent logs found');
      return [];
    }

    // 转换为交易记录格式
    const transactions: CreditTransaction[] = recentLogs.slice(0, limit).map(log => ({
      id: log.id,
      userId: '', // 网关API不返回userId
      type: 'consumption' as const,
      amount: log.quota || 0,
      balance: 0, // 网关API不返回余额，需要单独计算
      service: extractServiceFromModel(log.model),
      model: log.model,
      metadata: {
        prompt: log.content,
        promptTokens: log.prompt_tokens,
        completionTokens: log.completion_tokens,
      },
      createdAt: log.created_at,
    }));

    // 如果指定了类型过滤
    if (type) {
      return transactions.filter(t => t.type === type);
    }

    return transactions;
  } catch (error) {
    console.error('Error fetching recent transactions:', error);
    return [];
  }
};

/**
 * 从模型名称提取服务类型
 */
function extractServiceFromModel(model: string): string {
  if (model.includes('vidu') || model.includes('veo')) return 'video';
  if (
    model.includes('seedream') ||
    model.includes('seededit') ||
    model.includes('nano-banana') ||
    model.includes('dall-e')
  ) return 'image';
  if (model.includes('suno') || model.includes('minimax')) return 'audio';
  return 'chat';
}

/**
 * 获取完整的积分信息
 */
export const getCreditInfo = async (): Promise<CreditInfo> => {
  const [balance, usage, recentTransactions] = await Promise.all([
    getCreditBalance(),
    getCreditUsageStats(),
    getRecentTransactions(10),
  ]);

  return {
    balance,
    usage,
    recentTransactions,
  };
};


/**
 * 充值积分
 * TODO: 实现真实的充值API
 *
 * @param packageId 套餐ID
 */
export const rechargeCredits = async (packageId: string): Promise<boolean> => {
  try {
    console.log('Recharge credits with package:', packageId);
    return true;
  } catch (error) {
    console.error('Error recharging credits:', error);
    throw error;
  }
};
