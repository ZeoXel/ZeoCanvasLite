-- ================================================================
-- 零素觉醒平台 - 优化数据库架构 v2.0
-- 设计目标：性能、扩展性、数据完整性、监控审计
-- ================================================================

-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ================================================================
-- 核心函数定义
-- ================================================================

-- 生成简化用户ID（8位数字字母组合）
CREATE OR REPLACE FUNCTION generate_user_short_id()
RETURNS TEXT AS $$
DECLARE
    characters TEXT := '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- 排除容易混淆的字符I,O
    result TEXT := '';
    i INTEGER;
    max_attempts INTEGER := 50;
    attempt INTEGER := 0;
BEGIN
    LOOP
        result := '';
        -- 生成8位随机字符串
        FOR i IN 1..8 LOOP
            result := result || substr(characters, floor(random() * length(characters) + 1)::integer, 1);
        END LOOP;
        
        -- 检查唯一性
        IF NOT EXISTS(SELECT 1 FROM users WHERE short_id = result) THEN
            EXIT;
        END IF;
        
        attempt := attempt + 1;
        IF attempt >= max_attempts THEN
            RAISE EXCEPTION 'Unable to generate unique short_id after % attempts', max_attempts;
        END IF;
    END LOOP;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 生成支付订单号
CREATE OR REPLACE FUNCTION generate_order_no()
RETURNS TEXT AS $$
BEGIN
    RETURN 'ORD' || to_char(NOW(), 'YYYYMMDD') || lpad(extract(epoch FROM NOW())::bigint::text, 10, '0') || lpad(floor(random() * 10000)::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- Studio 用户数据同步
-- ================================================================

CREATE TABLE studio_user_data (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data JSONB DEFAULT '{}' NOT NULL,
    version INTEGER DEFAULT 1 NOT NULL,
    client_updated_at BIGINT DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 开启 RLS
ALTER TABLE studio_user_data ENABLE ROW LEVEL SECURITY;

-- 用户只访问自己的数据
CREATE POLICY studio_user_data_select ON studio_user_data
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY studio_user_data_insert ON studio_user_data
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY studio_user_data_update ON studio_user_data
    FOR UPDATE USING (auth.uid() = user_id);

-- 计算用户余额
CREATE OR REPLACE FUNCTION calculate_user_balance(user_uuid UUID)
RETURNS DECIMAL(12,2) AS $$
DECLARE
    total_recharge DECIMAL(12,2) := 0;
    total_consumption DECIMAL(12,2) := 0;
BEGIN
    -- 计算总充值
    SELECT COALESCE(SUM(points), 0) INTO total_recharge
    FROM payments 
    WHERE user_id = user_uuid AND status = 'paid';
    
    -- 计算总消费
    SELECT COALESCE(SUM(-amount), 0) INTO total_consumption
    FROM balance_logs 
    WHERE user_id = user_uuid AND type = 'consume';
    
    RETURN GREATEST(0, total_recharge - total_consumption);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- 核心数据表
-- ================================================================

-- 创建枚举类型（保证在表之前）
DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('user', 'vip', 'admin', 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE TYPE user_status_enum AS ENUM ('active', 'suspended', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE TYPE api_key_status_enum AS ENUM ('active', 'assigned', 'suspended', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE TYPE payment_method_enum AS ENUM ('alipay', 'wechat', 'bank', 'paypal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE TYPE payment_status_enum AS ENUM ('pending', 'processing', 'paid', 'failed', 'cancelled', 'refunded', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE TYPE balance_log_type_enum AS ENUM ('recharge', 'consume', 'refund', 'adjustment', 'bonus', 'penalty');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 用户表（优化版本）
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    short_id VARCHAR(8) UNIQUE NOT NULL DEFAULT generate_user_short_id(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255), -- 新增邮箱字段
    avatar_url TEXT, -- 新增头像字段
    balance DECIMAL(12,2) DEFAULT 0.00 NOT NULL CHECK (balance >= 0),
    role user_role_enum DEFAULT 'user' NOT NULL,
    status user_status_enum DEFAULT 'active' NOT NULL,
    -- 扩展信息
    settings JSONB DEFAULT '{}' NOT NULL, -- 用户设置
    metadata JSONB DEFAULT '{}' NOT NULL, -- 元数据
    -- 统计字段
    total_recharge DECIMAL(12,2) DEFAULT 0 NOT NULL CHECK (total_recharge >= 0),
    total_consumption DECIMAL(12,2) DEFAULT 0 NOT NULL CHECK (total_consumption >= 0),
    api_calls_count BIGINT DEFAULT 0 NOT NULL CHECK (api_calls_count >= 0),
    last_api_call_at TIMESTAMP WITH TIME ZONE,
    -- 时间戳
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- API密钥池表（优化版本）
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_value TEXT UNIQUE NOT NULL,
    key_preview TEXT GENERATED ALWAYS AS (
        CASE 
            WHEN length(key_value) > 20 THEN left(key_value, 8) || '...' || right(key_value, 8)
            ELSE left(key_value, 8) || '...'
        END
    ) STORED,
    provider VARCHAR(50) NOT NULL, -- openai, claude, gemini, etc.
    model_type VARCHAR(100), -- gpt-4, claude-3, etc.
    key_type VARCHAR(50) DEFAULT 'api_key', -- api_key, access_token, etc.
    status api_key_status_enum DEFAULT 'active' NOT NULL,
    -- 分配信息
    assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP WITH TIME ZONE,
    -- 配额信息
    quota_limit BIGINT, -- 配额限制
    quota_used BIGINT DEFAULT 0 NOT NULL CHECK (quota_used >= 0),
    quota_reset_at TIMESTAMP WITH TIME ZONE, -- 配额重置时间
    -- 费率信息
    cost_per_1k_tokens DECIMAL(8,4) DEFAULT 0.001, -- 每1K token费用
    -- 扩展信息
    config JSONB DEFAULT '{}' NOT NULL, -- 密钥配置
    metadata JSONB DEFAULT '{}' NOT NULL, -- 元数据
    -- 统计信息
    total_calls BIGINT DEFAULT 0 NOT NULL CHECK (total_calls >= 0),
    total_tokens BIGINT DEFAULT 0 NOT NULL CHECK (total_tokens >= 0),
    total_cost DECIMAL(12,2) DEFAULT 0 NOT NULL CHECK (total_cost >= 0),
    last_used_at TIMESTAMP WITH TIME ZONE,
    -- 时间戳
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE -- 密钥过期时间
);

-- 支付订单表（优化版本）
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_no VARCHAR(64) UNIQUE NOT NULL DEFAULT generate_order_no(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    -- 金额信息
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0), -- 支付金额（元）
    points DECIMAL(12,2) NOT NULL CHECK (points > 0), -- 获得点数
    bonus_points DECIMAL(12,2) DEFAULT 0 NOT NULL CHECK (bonus_points >= 0), -- 赠送点数
    actual_amount DECIMAL(10,2) NOT NULL CHECK (actual_amount >= 0), -- 实际支付金额
    -- 支付信息
    payment_method payment_method_enum NOT NULL,
    payment_channel VARCHAR(50), -- 具体支付渠道
    status payment_status_enum DEFAULT 'pending' NOT NULL,
    -- 第三方信息
    transaction_id VARCHAR(128), -- 第三方交易号
    gateway_order_no VARCHAR(128), -- 网关订单号
    -- 描述信息
    title VARCHAR(200) NOT NULL, -- 订单标题
    description TEXT, -- 订单描述
    -- 回调数据
    notify_data JSONB, -- 支付回调原始数据
    notify_signature TEXT, -- 回调签名
    -- 时间信息
    paid_at TIMESTAMP WITH TIME ZONE,
    expired_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 minutes'), -- 订单过期时间
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    -- 客户端信息
    client_ip INET,
    user_agent TEXT
);

-- 余额变动记录表（优化版本）
CREATE TABLE balance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    type balance_log_type_enum NOT NULL,
    -- 金额信息
    amount DECIMAL(12,2) NOT NULL, -- 变动金额（正数增加，负数减少）
    balance_before DECIMAL(12,2) NOT NULL CHECK (balance_before >= 0),
    balance_after DECIMAL(12,2) NOT NULL CHECK (balance_after >= 0),
    -- 关联信息
    related_payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    related_api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    related_order_no VARCHAR(64), -- 关联订单号
    -- 描述信息
    title VARCHAR(200) NOT NULL, -- 变动标题
    description TEXT, -- 详细描述
    -- 扩展数据
    api_usage_data JSONB, -- API使用详情
    metadata JSONB DEFAULT '{}', -- 元数据
    -- 时间戳
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    -- 操作信息
    operator_id UUID REFERENCES users(id) ON DELETE SET NULL, -- 操作员
    client_ip INET,
    user_agent TEXT
);

-- API使用统计表（优化版本）
CREATE TABLE api_usage_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    -- 时间维度
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    hour_of_day SMALLINT CHECK (hour_of_day >= 0 AND hour_of_day <= 23),
    -- 统计数据
    total_requests INTEGER DEFAULT 0 NOT NULL CHECK (total_requests >= 0),
    successful_requests INTEGER DEFAULT 0 NOT NULL CHECK (successful_requests >= 0),
    failed_requests INTEGER DEFAULT 0 NOT NULL CHECK (failed_requests >= 0),
    total_tokens BIGINT DEFAULT 0 NOT NULL CHECK (total_tokens >= 0),
    input_tokens BIGINT DEFAULT 0 NOT NULL CHECK (input_tokens >= 0),
    output_tokens BIGINT DEFAULT 0 NOT NULL CHECK (output_tokens >= 0),
    total_cost DECIMAL(12,2) DEFAULT 0.00 NOT NULL CHECK (total_cost >= 0),
    -- 扩展统计
    avg_response_time INTEGER, -- 平均响应时间（毫秒）
    max_response_time INTEGER, -- 最大响应时间
    min_response_time INTEGER, -- 最小响应时间
    -- 详细数据
    usage_details JSONB DEFAULT '{}', -- 详细使用数据
    error_details JSONB DEFAULT '{}', -- 错误统计
    -- 时间戳
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    -- 唯一约束
    UNIQUE(user_id, api_key_id, date, hour_of_day)
);

-- 用户会话表（优化版本）
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    session_token TEXT UNIQUE NOT NULL,
    -- 会话信息
    device_type VARCHAR(50), -- mobile, desktop, tablet
    device_id VARCHAR(200), -- 设备标识
    ip_address INET,
    user_agent TEXT,
    location JSONB, -- 地理位置信息
    -- 时间信息
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    -- 状态
    is_active BOOLEAN DEFAULT true NOT NULL
);

-- 系统审计日志表（优化版本）
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- 操作信息
    action VARCHAR(100) NOT NULL, -- 操作类型
    resource_type VARCHAR(50), -- 资源类型
    resource_id UUID, -- 资源ID
    -- 用户信息
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_role VARCHAR(20),
    -- 请求信息
    ip_address INET,
    user_agent TEXT,
    request_method VARCHAR(10),
    request_path TEXT,
    -- 详细信息
    details JSONB DEFAULT '{}', -- 详细操作数据
    changes JSONB, -- 变更前后对比
    -- 结果信息
    status VARCHAR(20) DEFAULT 'success', -- success, failed, error
    error_message TEXT,
    -- 时间戳
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 系统配置表
CREATE TABLE system_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT false, -- 是否对客户端公开
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 通知消息表
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- system, payment, usage, etc.
    title VARCHAR(200) NOT NULL,
    content TEXT,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE
);

-- ================================================================
-- 索引优化
-- ================================================================

-- 用户表索引
CREATE UNIQUE INDEX idx_users_phone ON users(phone) WHERE status != 'deleted';
CREATE INDEX idx_users_role_status ON users(role, status);
CREATE INDEX idx_users_short_id ON users(short_id);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_last_login ON users(last_login_at);

-- API密钥索引
CREATE INDEX idx_api_keys_status ON api_keys(status);
CREATE INDEX idx_api_keys_provider ON api_keys(provider, status);
CREATE INDEX idx_api_keys_assigned_user ON api_keys(assigned_user_id) WHERE assigned_user_id IS NOT NULL;
CREATE INDEX idx_api_keys_expires_at ON api_keys(expires_at) WHERE expires_at IS NOT NULL;

-- 支付订单索引
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at);
CREATE INDEX idx_payments_method_status ON payments(payment_method, status);
CREATE INDEX idx_payments_expired_at ON payments(expired_at) WHERE status = 'pending';

-- 余额记录索引
CREATE INDEX idx_balance_logs_user_id ON balance_logs(user_id);
CREATE INDEX idx_balance_logs_type ON balance_logs(type);
CREATE INDEX idx_balance_logs_created_at ON balance_logs(created_at);
CREATE INDEX idx_balance_logs_payment ON balance_logs(related_payment_id) WHERE related_payment_id IS NOT NULL;

-- API使用统计索引
CREATE INDEX idx_api_usage_stats_user_date ON api_usage_stats(user_id, date);
CREATE INDEX idx_api_usage_stats_key_date ON api_usage_stats(api_key_id, date) WHERE api_key_id IS NOT NULL;
CREATE INDEX idx_api_usage_stats_date_hour ON api_usage_stats(date, hour_of_day);

-- 会话索引
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX idx_user_sessions_active ON user_sessions(user_id, is_active, expires_at);

-- 审计日志索引
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id) WHERE resource_id IS NOT NULL;

-- 通知索引
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read, created_at) WHERE is_read = false;

-- ================================================================
-- 触发器和函数
-- ================================================================

-- 自动更新时间戳
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建更新时间戳触发器
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_api_usage_stats_updated_at BEFORE UPDATE ON api_usage_stats FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_system_configs_updated_at BEFORE UPDATE ON system_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 用户余额更新触发器
CREATE OR REPLACE FUNCTION update_user_balance_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- 更新用户统计
        UPDATE users SET
            total_recharge = CASE 
                WHEN NEW.type = 'recharge' THEN total_recharge + NEW.amount
                ELSE total_recharge 
            END,
            total_consumption = CASE 
                WHEN NEW.type = 'consume' THEN total_consumption + ABS(NEW.amount)
                ELSE total_consumption 
            END,
            balance = NEW.balance_after,
            updated_at = NOW()
        WHERE id = NEW.user_id;
        
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_balance_stats 
    AFTER INSERT ON balance_logs 
    FOR EACH ROW EXECUTE FUNCTION update_user_balance_stats();

-- 支付成功处理函数
CREATE OR REPLACE FUNCTION handle_payment_success()
RETURNS TRIGGER AS $$
BEGIN
    -- 只处理状态从非paid变为paid的情况
    IF OLD.status != 'paid' AND NEW.status = 'paid' THEN
        -- 记录余额变动
        INSERT INTO balance_logs (
            user_id,
            type,
            amount,
            balance_before,
            balance_after,
            related_payment_id,
            title,
            description,
            metadata
        ) VALUES (
            NEW.user_id,
            'recharge',
            NEW.points + NEW.bonus_points,
            (SELECT balance FROM users WHERE id = NEW.user_id),
            (SELECT balance FROM users WHERE id = NEW.user_id) + NEW.points + NEW.bonus_points,
            NEW.id,
            '充值成功',
            format('订单号：%s，支付金额：%.2f元', NEW.order_no, NEW.actual_amount),
            jsonb_build_object(
                'payment_method', NEW.payment_method,
                'points', NEW.points,
                'bonus_points', NEW.bonus_points,
                'transaction_id', NEW.transaction_id
            )
        );
        
        -- 更新支付时间
        NEW.paid_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_handle_payment_success 
    BEFORE UPDATE ON payments 
    FOR EACH ROW EXECUTE FUNCTION handle_payment_success();

-- API调用统计更新
CREATE OR REPLACE FUNCTION update_api_usage_aggregation(
    p_user_id UUID,
    p_api_key_id UUID,
    p_tokens INTEGER DEFAULT 0,
    p_cost DECIMAL DEFAULT 0,
    p_success BOOLEAN DEFAULT true
)
RETURNS void AS $$
DECLARE
    current_date DATE := CURRENT_DATE;
    current_hour SMALLINT := extract(hour FROM NOW());
BEGIN
    -- 更新或插入统计记录
    INSERT INTO api_usage_stats (
        user_id, api_key_id, date, hour_of_day,
        total_requests, successful_requests, failed_requests,
        total_tokens, total_cost
    ) VALUES (
        p_user_id, p_api_key_id, current_date, current_hour,
        1,
        CASE WHEN p_success THEN 1 ELSE 0 END,
        CASE WHEN NOT p_success THEN 1 ELSE 0 END,
        p_tokens, p_cost
    )
    ON CONFLICT (user_id, api_key_id, date, hour_of_day)
    DO UPDATE SET
        total_requests = api_usage_stats.total_requests + 1,
        successful_requests = api_usage_stats.successful_requests + 
            CASE WHEN p_success THEN 1 ELSE 0 END,
        failed_requests = api_usage_stats.failed_requests + 
            CASE WHEN NOT p_success THEN 1 ELSE 0 END,
        total_tokens = api_usage_stats.total_tokens + p_tokens,
        total_cost = api_usage_stats.total_cost + p_cost,
        updated_at = NOW();

    -- 更新API密钥统计
    UPDATE api_keys SET
        total_calls = total_calls + 1,
        total_tokens = total_tokens + p_tokens,
        total_cost = total_cost + p_cost,
        quota_used = quota_used + p_tokens,
        last_used_at = NOW(),
        updated_at = NOW()
    WHERE id = p_api_key_id;

    -- 更新用户统计
    UPDATE users SET
        api_calls_count = api_calls_count + 1,
        last_api_call_at = NOW(),
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- Row Level Security (RLS) 策略
-- ================================================================

-- 启用RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 用户表策略
CREATE POLICY "users_view_own" ON users FOR SELECT USING (auth.uid()::text = id::text);
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid()::text = id::text);
CREATE POLICY "users_admin_all" ON users FOR ALL USING (
    EXISTS(SELECT 1 FROM users WHERE id = auth.uid()::uuid AND role IN ('admin', 'super_admin'))
);

-- API密钥策略
CREATE POLICY "api_keys_view_assigned" ON api_keys FOR SELECT USING (
    assigned_user_id = auth.uid()::uuid OR
    EXISTS(SELECT 1 FROM users WHERE id = auth.uid()::uuid AND role IN ('admin', 'super_admin'))
);

-- 支付订单策略
CREATE POLICY "payments_view_own" ON payments FOR SELECT USING (user_id = auth.uid()::uuid);
CREATE POLICY "payments_admin_all" ON payments FOR ALL USING (
    EXISTS(SELECT 1 FROM users WHERE id = auth.uid()::uuid AND role IN ('admin', 'super_admin'))
);

-- 余额记录策略
CREATE POLICY "balance_logs_view_own" ON balance_logs FOR SELECT USING (user_id = auth.uid()::uuid);

-- API统计策略
CREATE POLICY "api_usage_stats_view_own" ON api_usage_stats FOR SELECT USING (user_id = auth.uid()::uuid);

-- 服务角色完全访问
CREATE POLICY "service_role_all" ON users FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_api_keys" ON api_keys FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_payments" ON payments FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_balance_logs" ON balance_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_api_usage_stats" ON api_usage_stats FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_user_sessions" ON user_sessions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_audit_logs" ON audit_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_notifications" ON notifications FOR ALL USING (auth.role() = 'service_role');

-- ================================================================
-- 初始化数据
-- ================================================================

-- 插入系统配置
INSERT INTO system_configs (key, value, description, is_public) VALUES
('payment.alipay.enabled', 'true', '支付宝支付开关', true),
('payment.wechat.enabled', 'true', '微信支付开关', true),
('payment.min_amount', '1.00', '最小充值金额', true),
('payment.max_amount', '10000.00', '最大充值金额', true),
('api.rate_limit.default', '1000', '默认API调用频率限制（每小时）', false),
('system.maintenance_mode', 'false', '系统维护模式', true)
ON CONFLICT (key) DO NOTHING;

-- 插入超级管理员
INSERT INTO users (phone, name, role, balance, short_id) 
VALUES ('19857149421', '超级管理员', 'super_admin', 10000.00, 'ADMIN001')
ON CONFLICT (phone) DO UPDATE SET
    role = 'super_admin',
    name = '超级管理员';

-- 插入示例API密钥
INSERT INTO api_keys (key_value, provider, model_type, status, quota_limit) VALUES
('sk-openai-demo-' || substr(md5(random()::text), 1, 16), 'openai', 'gpt-4', 'active', 1000000),
('sk-claude-demo-' || substr(md5(random()::text), 1, 16), 'claude', 'claude-3', 'active', 1000000),
('sk-gemini-demo-' || substr(md5(random()::text), 1, 16), 'gemini', 'gemini-pro', 'active', 1000000)
ON CONFLICT (key_value) DO NOTHING;

-- ================================================================
-- 维护和监控函数
-- ================================================================

-- 清理过期会话
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_sessions WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 清理过期订单
CREATE OR REPLACE FUNCTION cleanup_expired_payments()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE payments 
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'pending' AND expired_at < NOW();
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- 计算用户统计
CREATE OR REPLACE FUNCTION refresh_user_stats(target_user_id UUID DEFAULT NULL)
RETURNS void AS $$
BEGIN
    UPDATE users SET
        total_recharge = COALESCE((
            SELECT SUM(points + bonus_points) FROM payments 
            WHERE user_id = users.id AND status = 'paid'
        ), 0),
        total_consumption = COALESCE((
            SELECT SUM(ABS(amount)) FROM balance_logs 
            WHERE user_id = users.id AND type = 'consume'
        ), 0),
        api_calls_count = COALESCE((
            SELECT SUM(total_requests) FROM api_usage_stats 
            WHERE user_id = users.id
        ), 0),
        balance = calculate_user_balance(users.id),
        updated_at = NOW()
    WHERE (target_user_id IS NULL OR id = target_user_id);
END;
$$ LANGUAGE plpgsql;
