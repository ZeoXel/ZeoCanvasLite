-- ================================================================
-- 零素觉醒平台 - 验证码表创建脚本
-- 创建时间：2025-09-11
-- 用途：支持手机验证码登录/注册功能
-- ================================================================

-- 创建验证码表
CREATE TABLE verification_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) NOT NULL,
    code VARCHAR(10) NOT NULL,
    name VARCHAR(100), -- 可选的用户名（注册时使用）
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE
);

-- 创建索引以提升查询性能
CREATE INDEX idx_verification_codes_phone ON verification_codes(phone);
CREATE INDEX idx_verification_codes_expires_at ON verification_codes(expires_at);
CREATE INDEX idx_verification_codes_phone_code ON verification_codes(phone, code) WHERE NOT used;

-- 创建复合索引用于验证查询
CREATE INDEX idx_verification_codes_lookup ON verification_codes(phone, code, expires_at) WHERE NOT used;

-- 启用行级安全策略 (RLS)
ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;

-- 创建 RLS 策略 - 只有服务角色可以访问验证码表
CREATE POLICY "service_role_verification_codes" ON verification_codes FOR ALL USING (auth.role() = 'service_role');

-- 创建自动清理过期验证码的函数
CREATE OR REPLACE FUNCTION cleanup_expired_verification_codes()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM verification_codes 
    WHERE expires_at < NOW() OR used = true;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 注释说明
COMMENT ON TABLE verification_codes IS '手机验证码表 - 用于登录/注册验证';
COMMENT ON COLUMN verification_codes.phone IS '手机号码';
COMMENT ON COLUMN verification_codes.code IS '验证码（6位数字）';
COMMENT ON COLUMN verification_codes.name IS '用户名（注册时可选）';
COMMENT ON COLUMN verification_codes.expires_at IS '过期时间（默认5分钟）';
COMMENT ON COLUMN verification_codes.used IS '是否已使用';
COMMENT ON COLUMN verification_codes.created_at IS '创建时间';
COMMENT ON COLUMN verification_codes.used_at IS '使用时间';

-- ================================================================
-- 使用说明：
-- 1. 在 Supabase SQL 编辑器中执行此脚本
-- 2. 验证码有效期为5分钟
-- 3. 使用后会自动标记为已使用
-- 4. 可以定期调用 cleanup_expired_verification_codes() 清理过期记录
-- ================================================================