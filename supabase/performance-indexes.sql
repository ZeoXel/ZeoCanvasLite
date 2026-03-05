-- ================================================================
-- 性能优化索引 - 提升查询性能
-- 执行时间：2025-09-16
-- 目标：优化常用查询的响应时间
-- ================================================================

-- 1. 支付订单索引 - 提升订单查询性能
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_order_no
ON payments(order_no);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_user_id
ON payments(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_status
ON payments(status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_created_at
ON payments(created_at DESC);

-- 2. API密钥索引 - 提升密钥管理性能
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_assigned_user_id
ON api_keys(assigned_user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_status
ON api_keys(status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_provider
ON api_keys(provider);

-- 3. 用户相关索引 - 提升用户查询性能
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_short_id
ON users(short_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email
ON users(email);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created_at
ON users(created_at DESC);

-- 4. 余额日志索引 - 提升余额记录查询
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_balance_logs_user_id
ON balance_logs(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_balance_logs_created_at
ON balance_logs(created_at DESC);

-- 5. 复合索引 - 优化复杂查询
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_user_status
ON payments(user_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_user_status
ON api_keys(assigned_user_id, status);

-- 6. 验证索引创建
SELECT
    indexname,
    tablename,
    schemaname
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- 执行完成提示
SELECT 'Performance indexes created successfully!' as status;