-- 更新用户名生成格式为 "新用户USER0001" 格式
-- 执行时间：2025-09-12

-- 1. 创建新的用户名生成函数
CREATE OR REPLACE FUNCTION generate_formatted_user_name()
RETURNS TEXT AS $$
DECLARE
    user_count INTEGER;
    formatted_id TEXT;
BEGIN
    -- 获取当前用户总数
    SELECT COUNT(*) INTO user_count FROM users;
    
    -- 生成4位格式化ID
    formatted_id := LPAD((user_count + 1)::TEXT, 4, '0');
    
    -- 返回格式化的用户名
    RETURN '新用户USER' || formatted_id;
END;
$$ LANGUAGE plpgsql;

-- 2. 创建触发器函数，为新用户自动设置格式化名称
CREATE OR REPLACE FUNCTION set_default_user_name()
RETURNS TRIGGER AS $$
BEGIN
    -- 如果名称为空或为'新用户'，使用格式化名称
    IF NEW.name IS NULL OR NEW.name = '' OR NEW.name = '新用户' THEN
        NEW.name := generate_formatted_user_name();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. 创建触发器
DROP TRIGGER IF EXISTS set_user_name_before_insert ON users;
CREATE TRIGGER set_user_name_before_insert
    BEFORE INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_default_user_name();

-- 4. 更新现有的"新用户"记录（可选）
-- 为所有名称为"新用户"的用户生成新的格式化名称
DO $$
DECLARE
    user_record RECORD;
    counter INTEGER := 1;
BEGIN
    FOR user_record IN 
        SELECT id, name, created_at 
        FROM users 
        WHERE name = '新用户' OR name LIKE '新用户%'
        ORDER BY created_at
    LOOP
        UPDATE users 
        SET name = '新用户USER' || LPAD(counter::TEXT, 4, '0')
        WHERE id = user_record.id;
        
        counter := counter + 1;
    END LOOP;
END $$;

-- 5. 创建视图以便查看用户和其绑定的密钥信息
CREATE OR REPLACE VIEW user_with_keys AS
SELECT 
    u.id,
    u.short_id,
    u.phone,
    u.name,
    u.balance,
    u.total_recharge_amount,
    u.role,
    u.created_at,
    u.updated_at,
    -- 关联的密钥信息
    ak.id as key_id,
    ak.provider as key_provider,
    ak.status as key_status,
    ak.assigned_at as key_assigned_at
FROM users u
LEFT JOIN api_keys ak ON u.id = ak.assigned_user_id AND ak.status = 'assigned'
ORDER BY u.created_at DESC;

-- 6. 创建函数确保新用户自动分配密钥（改进版）
CREATE OR REPLACE FUNCTION auto_assign_key_to_new_user()
RETURNS TRIGGER AS $$
DECLARE
    available_key RECORD;
BEGIN
    -- 仅对新插入的用户执行
    IF TG_OP = 'INSERT' THEN
        -- 查找第一个可用的密钥
        SELECT id, key_value, provider 
        INTO available_key
        FROM api_keys 
        WHERE status = 'available' 
        ORDER BY created_at 
        LIMIT 1;
        
        -- 如果找到可用密钥，分配给新用户
        IF available_key.id IS NOT NULL THEN
            UPDATE api_keys 
            SET 
                status = 'assigned',
                assigned_user_id = NEW.id,
                assigned_at = NOW()
            WHERE id = available_key.id;
            
            -- 记录日志（可选）
            RAISE NOTICE '密钥 % 已分配给用户 %', available_key.id, NEW.id;
        ELSE
            -- 没有可用密钥时记录警告
            RAISE WARNING '没有可用密钥分配给新用户 %', NEW.id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. 创建密钥自动分配触发器
DROP TRIGGER IF EXISTS auto_assign_key_on_user_create ON users;
CREATE TRIGGER auto_assign_key_on_user_create
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_key_to_new_user();

-- 8. 优化：为用户和密钥关联添加索引
CREATE INDEX IF NOT EXISTS idx_api_keys_assigned_user ON api_keys(assigned_user_id) WHERE status = 'assigned';

-- 9. 添加统计函数
CREATE OR REPLACE FUNCTION get_user_statistics()
RETURNS TABLE(
    total_users BIGINT,
    users_with_keys BIGINT,
    users_without_keys BIGINT,
    available_keys BIGINT,
    assigned_keys BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM users)::BIGINT as total_users,
        (SELECT COUNT(DISTINCT assigned_user_id) FROM api_keys WHERE status = 'assigned')::BIGINT as users_with_keys,
        (SELECT COUNT(*) FROM users WHERE id NOT IN (SELECT DISTINCT assigned_user_id FROM api_keys WHERE status = 'assigned' AND assigned_user_id IS NOT NULL))::BIGINT as users_without_keys,
        (SELECT COUNT(*) FROM api_keys WHERE status = 'available')::BIGINT as available_keys,
        (SELECT COUNT(*) FROM api_keys WHERE status = 'assigned')::BIGINT as assigned_keys;
END;
$$ LANGUAGE plpgsql;

-- 执行统计查看当前状态
SELECT * FROM get_user_statistics();

COMMENT ON FUNCTION generate_formatted_user_name() IS '生成格式化的用户名，格式为：新用户USER0001';
COMMENT ON FUNCTION set_default_user_name() IS '为新用户设置默认的格式化名称';
COMMENT ON FUNCTION auto_assign_key_to_new_user() IS '自动为新注册用户分配可用的API密钥';
COMMENT ON VIEW user_with_keys IS '用户和其绑定密钥的联合视图';
COMMENT ON FUNCTION get_user_statistics() IS '获取用户和密钥的统计信息';