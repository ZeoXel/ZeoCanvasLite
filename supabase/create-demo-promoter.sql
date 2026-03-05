-- 创建示例推广者(用于测试)
-- 使用超级管理员账号作为推广者

-- 查询超级管理员ID
DO $$
DECLARE
    admin_user_id UUID;
BEGIN
    -- 获取超级管理员用户ID
    SELECT id INTO admin_user_id FROM users WHERE phone = '19857149421' LIMIT 1;

    IF admin_user_id IS NOT NULL THEN
        -- 创建推广者记录
        INSERT INTO promoters (user_id, promo_code, bonus_amount, is_active, note)
        VALUES (
            admin_user_id,
            'LS2024DEMO',
            10.00,
            true,
            '测试推广码 - 新用户可获得10元奖励'
        )
        ON CONFLICT (user_id) DO UPDATE SET
            promo_code = EXCLUDED.promo_code,
            bonus_amount = EXCLUDED.bonus_amount,
            note = EXCLUDED.note,
            updated_at = NOW();

        RAISE NOTICE '✅ 推广者创建成功: 推广码=LS2024DEMO, 奖励金额=10元';
    ELSE
        RAISE NOTICE '⚠️ 未找到超级管理员账号';
    END IF;
END $$;

-- 查看创建的推广者
SELECT
    p.promo_code,
    p.bonus_amount,
    p.is_active,
    u.name as promoter_name,
    u.phone as promoter_phone,
    p.note
FROM promoters p
JOIN users u ON p.user_id = u.id;
