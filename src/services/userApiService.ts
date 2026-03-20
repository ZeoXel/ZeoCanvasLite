/**
 * USERAPI 网关服务
 * 处理用户同步和 API Key 管理
 */

// USERAPI 响应类型
export interface UserApiUser {
    id: string;
    provider: string;
    name: string;
    username?: string; // 用户名，可自定义
    email: string | null;
    phone: string | null;
    avatar: string | null;
    role: string;
    status: string;
}

export interface UserApiKey {
    id: string;
    keyPrefix: string;
    fullKey?: string; // 仅新用户首次返回
    name: string;
    status: string;
    createdAt: string;
}

export interface UserSyncResponse {
    success: boolean;
    isNewUser: boolean;
    user: UserApiUser;
    apiKey: UserApiKey | null;
    message: string;
}

export interface UserMeResponse {
    user: UserApiUser & { createdAt: string };
    keys?: Array<{
        id: string;
        keyPrefix: string;
        name: string;
        status: string;
        quotaType: string;
        quotaLimit: number | null;
        quotaUsed: number;
        lastUsedAt: string | null;
        createdAt: string;
    }>;
    usage?: {
        last30Days: {
            totalRequests: number;
            totalCost: number;
        };
    };
    balance?: number;
}

// 存储 Key
const USERAPI_KEY = 'userapi_key';
const USERAPI_USER = 'userapi_user';
const USER_ASSIGNED_KEY = 'user_assigned_key';
const USER_ASSIGNED_KEY_TS = 'user_assigned_key_ts';

/**
 * 获取 USERAPI 基础 URL
 */
const getUserApiBaseUrl = (): string => {
    return process.env.NEXT_PUBLIC_USERAPI_URL || 'http://localhost:3001';
};

/**
 * 保存 API Key 到本地存储（保留 USERAPI_KEY 兼容字段）
 */
export const saveApiKey = (key: string) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem(USERAPI_KEY, key);
        localStorage.setItem(USER_ASSIGNED_KEY, key);
        localStorage.setItem(USER_ASSIGNED_KEY_TS, String(Date.now()));
    }
};

/**
 * 获取存储的 API Key（优先用户分配密钥）
 */
export const getApiKey = (): string | null => {
    if (typeof window !== 'undefined') {
        return localStorage.getItem(USER_ASSIGNED_KEY) || localStorage.getItem(USERAPI_KEY);
    }
    return null;
};

/**
 * 清除 API Key
 */
export const clearApiKey = () => {
    if (typeof window !== 'undefined') {
        localStorage.removeItem(USERAPI_KEY);
        localStorage.removeItem(USERAPI_USER);
        localStorage.removeItem(USER_ASSIGNED_KEY);
        localStorage.removeItem(USER_ASSIGNED_KEY_TS);
    }
};

/**
 * 保存 USERAPI 用户信息
 */
export const saveUserApiUser = (user: UserApiUser) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem(USERAPI_USER, JSON.stringify(user));
    }
};

/**
 * 获取存储的 USERAPI 用户信息
 */
export const getUserApiUser = (): UserApiUser | null => {
    if (typeof window !== 'undefined') {
        const userStr = localStorage.getItem(USERAPI_USER);
        if (userStr) {
            try {
                return JSON.parse(userStr);
            } catch {
                return null;
            }
        }
    }
    return null;
};

/**
 * 同步用户到 USERAPI
 * 在第三方登录成功后调用
 */
export const syncUserToUserApi = async (params: {
    provider: 'authing' | 'tencent' | 'wechat';
    provider_id: string;
    provider_token?: string;
    name?: string;
    phone?: string;
    email?: string;
    avatar?: string;
}): Promise<UserSyncResponse> => {
    const baseUrl = getUserApiBaseUrl();

    const response = await fetch(`${baseUrl}/api/user/sync`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Network error' }));
        throw new Error(error.error || 'Failed to sync user');
    }

    const data: UserSyncResponse = await response.json();

    // 保存用户信息
    if (data.user) {
        saveUserApiUser(data.user);
    }

    // 如果是新用户，保存完整的 API Key
    if (data.isNewUser && data.apiKey?.fullKey) {
        saveApiKey(data.apiKey.fullKey);
        console.log('[USERAPI] 新用户创建成功，API Key 已保存');
    }

    return data;
};

/**
 * 获取当前用户信息
 * 通过 API Key 或 provider 认证
 */
export const getUserInfo = async (): Promise<UserMeResponse | null> => {
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch('/api/user/profile', {
                credentials: 'include', // 确保发送 cookies
            });

            if (!response.ok) {
                // 如果是 401 且不是最后一次尝试，等待后重试
                if (response.status === 401 && attempt < maxRetries) {
                    console.log(`[getUserInfo] 401 error, retrying (${attempt + 1}/${maxRetries})...`);
                    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
                    continue;
                }
                return null;
            }

            const profile = await response.json();
            return {
                user: {
                    id: profile.id,
                    provider: 'tencent',
                    name: profile.name,
                    username: profile.name,
                    email: null,
                    phone: profile.phone || null,
                    avatar: null,
                    role: profile.role || 'user',
                    status: 'active',
                    createdAt: profile.createdAt,
                },
                keys: [],
                usage: {
                    last30Days: {
                        totalRequests: 0,
                        totalCost: 0,
                    },
                },
                balance: profile.balance || 0,
            };
        } catch (error) {
            if (attempt < maxRetries) {
                console.log(`[getUserInfo] Error on attempt ${attempt + 1}, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
            }
        }
    }

    return null;
};

/**
 * 检查是否已有有效的 API Key
 */
export const hasValidApiKey = (): boolean => {
    return !!getApiKey();
};

/**
 * 创建带有 API Key 认证的 fetch 请求
 * 用于通过 USERAPI 网关调用 API
 */
export const fetchWithApiKey = async (
    endpoint: string,
    options: RequestInit = {}
): Promise<Response> => {
    const baseUrl = getUserApiBaseUrl();
    const apiKey = getApiKey();

    if (!apiKey) {
        throw new Error('No API key available. Please login first.');
    }

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${apiKey}`);

    return fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers,
    });
};
