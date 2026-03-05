-- 删除自动重新计算total_recharge_amount的触发器
-- 这个触发器会覆盖手动修改和试用额度，导致充值后余额回滚

-- 1. 删除触发器
DROP TRIGGER IF EXISTS update_total_recharge_on_payment ON payments;

-- 2. 删除相关函数（可选，保留以防后续需要）
-- DROP FUNCTION IF EXISTS trigger_update_total_recharge();
-- DROP FUNCTION IF EXISTS update_user_total_recharge(UUID);

-- 3. 添加注释说明
COMMENT ON COLUMN users.total_recharge_amount IS '用户总充值金额（元）- 手动维护，包含试用额度，不自动重新计算';

-- 执行完成后的说明
SELECT
    '触发器删除完成' as status,
    '现在total_recharge_amount将仅通过应用层累加更新' as note,
    '试用额度将得到保护' as benefit;