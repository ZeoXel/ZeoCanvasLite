import { supabaseAdmin } from '@/lib/supabase';
import { ApiKeyService } from './apikey.service';
import {
  getApiUrlByProvider,
  getQuotaEndpointByProvider,
  getConversionRateByProvider,
  getPricingMultiplierByProvider,
} from '@/config/gateway.config';

// 服务端缓存：用户用量数据
const usageCache = new Map<string, { data: ApiUsageResponse; timestamp: number }>();
const USAGE_CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

interface ApiUsageResponse {
  success: boolean;
  data?: {
    quota: number;
    used: number;
    remaining: number;
  };
  error?: string;
}

interface UserBalanceInfo {
  userId: string;
  totalRecharge: number;
  apiConsumption: number;
  currentBalance: number;
  apiKeys: Array<{
    id: string;
    keyValue: string;
    provider: string;
    usage?: {
      quota: number;
      used: number;
      remaining: number;
    };
  }>;
}

export class BalanceService {
  static async queryApiKeyUsage(
    apiKey: string,
    userId?: string,
    userShortId?: string,
    provider?: string
  ): Promise<ApiUsageResponse> {
    // 检查缓存
    const cacheKey = `${apiKey}_${provider}`;
    const cached = usageCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < USAGE_CACHE_TTL) {
      console.log('[BalanceService] Using cached usage data');
      return cached.data;
    }

    try {
      const baseUrl = getApiUrlByProvider(provider);
      const quotaPath = getQuotaEndpointByProvider(provider);
      const endpoint = `${baseUrl}${quotaPath}`;

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      if (userShortId) headers['new-api-user'] = userShortId;
      else if (userId) headers['new-api-user'] = userId;

      console.log('[BalanceService] Querying usage:', { endpoint, provider, hasUserShortId: !!userShortId });

      const response = await fetch(endpoint, { method: 'GET', headers });

      console.log('[BalanceService] Response status:', response.status, response.statusText);

      if (!response.ok) {
        // 429 时返回缓存数据（如果有旧缓存）或空数据
        if (response.status === 429) {
          console.warn('[BalanceService] Rate limited, using stale cache or empty data');
          if (cached) {
            return cached.data;
          }
          return { success: true, data: { quota: 0, used: 0, remaining: 0 } };
        }
        console.error('[BalanceService] API request failed:', response.status, response.statusText);
        return { success: false, error: `API请求失败: ${response.status} ${response.statusText}` };
      }

      const data = await response.json();

      console.log('[BalanceService] Response data:', JSON.stringify(data));

      let quota = 0, used = 0, remaining = 0;

      if (data.data && (data.code === true || data.code === 200 || data.code === 0 || data.code === '0' || data.success === true)) {
        const tokenData = data.data;
        if ('total_granted' in tokenData || 'total_used' in tokenData || 'total_available' in tokenData) {
          quota = tokenData.total_granted || 0;
          used = tokenData.total_used || 0;
          remaining = tokenData.total_available || 0;
        } else {
          quota = tokenData.quota || 0;
          used = tokenData.used || tokenData.usage || 0;
          remaining = tokenData.remaining || (quota - used);
        }
      } else if (data.quota !== undefined && data.used_quota !== undefined) {
        used = data.used_quota;
        remaining = data.quota < 0 ? 0 : data.quota;
        quota = Math.abs(data.quota) + data.used_quota;
      } else if (data.data) {
        quota = data.data.quota || data.data.total_granted || 0;
        used = data.data.used || data.data.used_quota || data.data.total_used || 0;
        remaining = data.data.remaining || data.data.total_available || (quota - used);
      } else {
        quota = data.total_quota || data.total_granted || data.limit || 0;
        used = data.total_used || data.used_quota || data.usage || data.used || 0;
        remaining = data.total_available || data.remaining || (quota - used);
      }

      return { success: true, data: { quota, used, remaining } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '网络请求失败',
      };
    }
  }

  static async getUserBalanceInfo(userId: string): Promise<UserBalanceInfo> {
    const { UserService } = await import('./user.service');
    const user = await UserService.getUserById(userId);

    if (!user) throw new Error('用户不存在');

    const totalRechargeInYuan = user.total_recharge_amount || 0;
    const apiKeys = await ApiKeyService.getApiKeysByUserId(userId);
    const validApiKeys = apiKeys.filter(
      (key) => key.status === 'assigned' && key.key_value && key.key_value.startsWith('sk-')
    );

    const userShortId = user.short_id;
    let totalRawConsumption = 0;
    let totalBilledConsumption = 0;

    const apiKeysWithUsage = await Promise.all(
      validApiKeys.map(async (key) => {
        const usage = await this.queryApiKeyUsage(key.key_value, userId, userShortId, key.provider);

        if (usage.success && usage.data) {
          const conversionRate = getConversionRateByProvider(key.provider || 'lsapi');
          const pricingMultiplier = getPricingMultiplierByProvider(key.provider || 'lsapi');
          const rawConsumptionInYuan = usage.data.used / conversionRate;
          const billedConsumptionInYuan = rawConsumptionInYuan * pricingMultiplier;
          totalRawConsumption += rawConsumptionInYuan;
          totalBilledConsumption += billedConsumptionInYuan;
        }

        return {
          id: key.id,
          keyValue: key.key_value,
          provider: key.provider,
          usage: usage.success ? usage.data : undefined,
        };
      })
    );

    const balanceInYuan = totalRechargeInYuan - totalBilledConsumption;
    const currentBalance = balanceInYuan * 10;

    return {
      userId,
      totalRecharge: totalRechargeInYuan,
      apiConsumption: totalBilledConsumption,
      currentBalance,
      apiKeys: apiKeysWithUsage,
    };
  }

  static async updateUserBalance(userId: string): Promise<number> {
    const balanceInfo = await this.getUserBalanceInfo(userId);
    const { error } = await supabaseAdmin
      .from('users')
      .update({ balance: balanceInfo.currentBalance })
      .eq('id', userId);

    if (error) {
      throw new Error(`更新用户余额失败: ${error.message}`);
    }

    return balanceInfo.currentBalance;
  }
}
