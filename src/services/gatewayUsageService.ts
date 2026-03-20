/**
 * 网关用量查询服务
 * 调用 New API 网关的消费详情接口
 */

// ==================== 常量定义 ====================

// 网关额度转平台积分的换算率
// 网关额度 / QUOTA_TO_CREDITS = 平台积分
// 例如: 40000 / 50000 = 0.8 平台积分
const QUOTA_TO_CREDITS = 50000;

/**
 * 将网关额度转换为平台积分，保留2位小数
 */
function convertQuotaToCredits(quota: number): number {
  return Math.round((quota / QUOTA_TO_CREDITS) * 100) / 100;
}

// ==================== 类型定义 ====================

export interface UsageDetailSummary {
  totalQuota: number;        // 总额度（积分）
  totalAmount: number;        // 总金额（元）
  totalRequests: number;      // 总请求数
  totalTokens: number;        // 总token数
  avgLatency: number;         // 平均延迟（ms）
}

export interface ModelConsumption {
  model: string;              // 模型名称
  quota: number;              // 消耗额度
  amount: number;             // 消耗金额
  requests: number;           // 请求次数
  tokens: number;             // token数量
}

export interface DailyConsumption {
  date: string;               // 日期 YYYY-MM-DD
  quota: number;              // 当日消耗额度
  amount: number;             // 当日消耗金额
  requests: number;           // 当日请求数
}

export interface ConsumptionLog {
  id: string;
  created_at: string;         // 创建时间
  model: string;              // 模型名称
  quota: number;              // 消耗额度
  amount: number;             // 消耗金额
  prompt_tokens: number;      // 输入token
  completion_tokens: number;  // 输出token
  content: string;            // 请求内容（截断）
}

export interface UsageDetailResponse {
  success: boolean;
  summary: UsageDetailSummary;
  byModel: ModelConsumption[];
  byDate: DailyConsumption[];
  recentLogs: ConsumptionLog[];
}

export interface UsageLogsResponse {
  success: boolean;
  logs: ConsumptionLog[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ChartDataPoint {
  time: string;               // 时间点
  quota: number;              // 消耗额度
  amount: number;             // 消耗金额
  requests: number;           // 请求数
}

export interface UsageChartResponse {
  success: boolean;
  data: ChartDataPoint[];
  granularity: 'hour' | 'day';
}

// ==================== API 函数 ====================

/**
 * 获取详细消费报告（推荐使用）
 * @param start 开始时间戳（秒）
 * @param end 结束时间戳（秒）
 */
export async function getUsageDetail(
  start: number,
  end: number
): Promise<UsageDetailResponse> {
  try {
    // 注意：上游路径是 /api/usage/token/detail，通过 /api/gateway/ 代理转发
    const response = await fetch(
      `/api/gateway/api/usage/token/detail?start=${start}&end=${end}`,
      {
        method: 'GET',
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch usage detail: ${response.status}`);
    }

    const raw = await response.json();
    const data = raw.data || raw;

    // 转换上游 API 返回格式为内部格式，并将网关额度转换为平台积分
    // 上游字段: by_day, by_model, recent_logs, model_name
    // 内部字段: byDate, byModel, recentLogs, model
    const byDate: DailyConsumption[] = (data.by_day || []).map((d: any) => ({
      date: d.date,
      quota: convertQuotaToCredits(d.quota || 0),
      amount: Math.round((d.amount || 0) * 100) / 100,
      requests: d.requests || 0,
    }));

    const byModel: ModelConsumption[] = (data.by_model || []).map((m: any) => ({
      model: m.model_name || m.model || '',
      quota: convertQuotaToCredits(m.quota || 0),
      amount: Math.round((m.amount || 0) * 100) / 100,
      requests: m.requests || 0,
      tokens: m.tokens || 0,
    }));

    const recentLogs: ConsumptionLog[] = (data.recent_logs || []).map((log: any) => ({
      id: String(log.id),
      created_at: typeof log.created_at === 'number'
        ? new Date(log.created_at * 1000).toISOString()
        : log.created_at,
      model: log.model_name || log.model || '',
      quota: convertQuotaToCredits(log.quota || 0),
      amount: Math.round((log.amount || 0) * 100) / 100,
      prompt_tokens: log.prompt_tokens || 0,
      completion_tokens: log.completion_tokens || 0,
      content: log.content || '',
    }));

    // 计算汇总数据（已转换为平台积分）
    const totalQuota = Math.round(byDate.reduce((sum, d) => sum + d.quota, 0) * 100) / 100;
    const totalAmount = Math.round(byDate.reduce((sum, d) => sum + d.amount, 0) * 100) / 100;
    const totalRequests = byDate.reduce((sum, d) => sum + d.requests, 0);
    const totalTokens = byModel.reduce((sum, m) => sum + m.tokens, 0);

    return {
      success: true,
      summary: {
        totalQuota,
        totalAmount,
        totalRequests,
        totalTokens,
        avgLatency: 0,
      },
      byModel,
      byDate,
      recentLogs,
    };
  } catch (error) {
    console.error('[GatewayUsage] Error fetching usage detail:', error);
    throw error;
  }
}

/**
 * 获取消费日志（分页）
 * @param start 开始时间戳（秒）
 * @param end 结束时间戳（秒）
 * @param modelName 模型名称（可选）
 * @param page 页码（从1开始）
 * @param pageSize 每页数量
 */
export async function getUsageLogs(
  start: number,
  end: number,
  modelName?: string,
  page: number = 1,
  pageSize: number = 20
): Promise<UsageLogsResponse> {
  try {
    const params = new URLSearchParams({
      start: start.toString(),
      end: end.toString(),
      page: page.toString(),
      page_size: pageSize.toString(),
    });

    if (modelName) {
      params.append('model_name', modelName);
    }

    const response = await fetch(
      `/api/gateway/api/usage/token/logs?${params.toString()}`,
      {
        method: 'GET',
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch usage logs: ${response.status}`);
    }

    const raw = await response.json();
    const data = raw.data || raw;

    // 转换日志格式，并将网关额度转换为平台积分
    const logs: ConsumptionLog[] = (data.logs || []).map((log: any) => ({
      id: String(log.id),
      created_at: typeof log.created_at === 'number'
        ? new Date(log.created_at * 1000).toISOString()
        : log.created_at,
      model: log.model_name || log.model || '',
      quota: convertQuotaToCredits(log.quota || 0),
      amount: Math.round((log.amount || 0) * 100) / 100,
      prompt_tokens: log.prompt_tokens || 0,
      completion_tokens: log.completion_tokens || 0,
      content: log.content || '',
    }));

    return {
      success: true,
      logs,
      total: data.total || logs.length,
      page: data.page || page,
      pageSize: data.page_size || pageSize,
    };
  } catch (error) {
    console.error('[GatewayUsage] Error fetching usage logs:', error);
    throw error;
  }
}

/**
 * 获取图表数据
 * @param start 开始时间戳（秒）
 * @param end 结束时间戳（秒）
 * @param granularity 粒度（hour/day）
 */
export async function getUsageChart(
  start: number,
  end: number,
  granularity: 'hour' | 'day' = 'day'
): Promise<UsageChartResponse> {
  try {
    const response = await fetch(
      `/api/gateway/api/usage/token/chart?start=${start}&end=${end}&granularity=${granularity}`,
      {
        method: 'GET',
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch usage chart: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[GatewayUsage] Error fetching usage chart:', error);
    throw error;
  }
}

// ==================== 辅助函数 ====================

/**
 * 获取最近N天的时间范围
 */
export function getRecentDaysRange(days: number): { start: number; end: number } {
  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 24 * 60 * 60;
  return { start, end };
}

/**
 * 获取今天的时间范围
 */
export function getTodayRange(): { start: number; end: number } {
  const now = new Date();
  const start = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);
  const end = Math.floor(Date.now() / 1000);
  return { start, end };
}

/**
 * 获取本月的时间范围
 */
export function getThisMonthRange(): { start: number; end: number } {
  const now = new Date();
  const start = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
  const end = Math.floor(Date.now() / 1000);
  return { start, end };
}
