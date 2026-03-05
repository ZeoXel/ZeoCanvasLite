-- 创建工作空间用户配置表
-- 用于存储用户在创作空间的密钥配置信息

CREATE TABLE IF NOT EXISTS workspace_user_configs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    keys_data JSONB NOT NULL,
    last_sync TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_workspace_user_configs_user_id ON workspace_user_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_user_configs_last_sync ON workspace_user_configs(last_sync);
CREATE INDEX IF NOT EXISTS idx_workspace_user_configs_version ON workspace_user_configs(version);

-- 确保每个用户只有一条配置记录
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_user_configs_unique_user 
ON workspace_user_configs(user_id);

-- 创建更新时间自动更新触发器
CREATE TRIGGER update_workspace_user_configs_updated_at 
    BEFORE UPDATE ON workspace_user_configs 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 启用行级安全策略
ALTER TABLE workspace_user_configs ENABLE ROW LEVEL SECURITY;

-- 创建安全策略
-- 用户只能查看和更新自己的配置
CREATE POLICY "Users can view own workspace config" ON workspace_user_configs
    FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update own workspace config" ON workspace_user_configs
    FOR UPDATE USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert own workspace config" ON workspace_user_configs
    FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

-- 服务角色可以访问所有数据
CREATE POLICY "Service role can access all workspace configs" ON workspace_user_configs
    FOR ALL USING (auth.role() = 'service_role');

-- 插入说明注释
COMMENT ON TABLE workspace_user_configs IS '工作空间用户配置表，存储用户在创作空间的密钥等配置信息';
COMMENT ON COLUMN workspace_user_configs.user_id IS '关联的用户ID';
COMMENT ON COLUMN workspace_user_configs.keys_data IS '密钥配置数据，JSON格式存储';
COMMENT ON COLUMN workspace_user_configs.last_sync IS '最后同步时间';
COMMENT ON COLUMN workspace_user_configs.version IS '配置版本号，用于增量更新';