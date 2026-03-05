-- ============================================
-- 用户密钥更换工具脚本
-- 在 Supabase SQL Editor 中执行
-- ============================================

-- 📋 第一步：查看用户当前使用的密钥
-- ============================================
SELECT
  u.id as user_id,
  u.name,
  u.phone,
  u.short_id,
  ak.id as current_key_id,
  LEFT(ak.key_value, 10) || '...' || RIGHT(ak.key_value, 8) as key_preview,
  ak.key_value as full_key,
  ak.provider,
  ak.status,
  ak.assigned_at
FROM users u
LEFT JOIN api_keys ak ON u.id = ak.assigned_user_id
WHERE ak.status = 'assigned'
ORDER BY u.created_at DESC;

-- 🔍 第二步：查看密钥库中可用的密钥
-- ============================================

-- 查看所有可用密钥
SELECT
  id as key_id,
  LEFT(key_value, 10) || '...' || RIGHT(key_value, 8) as key_preview,
  key_value as full_key,
  provider,
  status,
  created_at
FROM api_keys
WHERE status = 'active'  -- 未分配的密钥
ORDER BY provider, created_at DESC;

-- 查看 bltcy 网关的可用密钥
SELECT
  id,
  LEFT(key_value, 10) || '...' as preview,
  provider
FROM api_keys
WHERE status = 'active' AND provider = 'bltcy'
ORDER BY created_at DESC;

-- 查看 lsapi (Railway) 网关的可用密钥
SELECT
  id,
  LEFT(key_value, 10) || '...' as preview,
  provider
FROM api_keys
WHERE status = 'active' AND provider = 'lsapi'
ORDER BY created_at DESC;

-- ============================================
-- ✏️ 第三步：执行更换操作
-- ============================================

-- 方案A：通过手机号更换密钥（推荐）
-- 请修改下面的参数后执行
-- ============================================
BEGIN;

-- 1. 解绑旧密钥
UPDATE api_keys
SET
  status = 'active',
  assigned_user_id = NULL,
  assigned_at = NULL
WHERE assigned_user_id = (
  SELECT id FROM users WHERE phone = '替换为手机号'
)
AND status = 'assigned';

-- 2. 分配新密钥（方法1：指定密钥值）
UPDATE api_keys
SET
  status = 'assigned',
  assigned_user_id = (SELECT id FROM users WHERE phone = '替换为手机号'),
  assigned_at = NOW()
WHERE key_value = '替换为新密钥的完整值'
AND status = 'active';

-- 或者 方法2：自动选择可用密钥
-- UPDATE api_keys
-- SET
--   status = 'assigned',
--   assigned_user_id = (SELECT id FROM users WHERE phone = '替换为手机号'),
--   assigned_at = NOW()
-- WHERE id = (
--   SELECT id FROM api_keys
--   WHERE status = 'active' AND provider = 'lsapi'  -- 或 'bltcy'
--   ORDER BY created_at ASC
--   LIMIT 1
-- );

-- 3. 更新用户表
UPDATE users
SET assigned_key_id = (
  SELECT id FROM api_keys
  WHERE assigned_user_id = users.id
  AND status = 'assigned'
  LIMIT 1
)
WHERE phone = '替换为手机号';

-- ⚠️ 执行前请先检查上面的查询结果
-- 确认无误后执行 COMMIT，否则执行 ROLLBACK
COMMIT;
-- ROLLBACK;

-- ============================================
-- 方案B：通过用户ID更换密钥
-- ============================================
-- BEGIN;
--
-- UPDATE api_keys
-- SET status = 'active', assigned_user_id = NULL, assigned_at = NULL
-- WHERE assigned_user_id = '替换为用户UUID';
--
-- UPDATE api_keys
-- SET
--   status = 'assigned',
--   assigned_user_id = '替换为用户UUID',
--   assigned_at = NOW()
-- WHERE key_value = '替换为新密钥值';
--
-- UPDATE users
-- SET assigned_key_id = (SELECT id FROM api_keys WHERE key_value = '替换为新密钥值')
-- WHERE id = '替换为用户UUID';
--
-- COMMIT;

-- ============================================
-- 方案C：批量更换所有用户为 Railway 网关密钥
-- ⚠️ 谨慎使用！会影响所有用户
-- ============================================
-- BEGIN;
--
-- -- 1. 解绑所有密钥
-- UPDATE api_keys
-- SET status = 'active', assigned_user_id = NULL, assigned_at = NULL
-- WHERE status = 'assigned';
--
-- -- 2. 为每个用户分配 lsapi 密钥
-- WITH available_keys AS (
--   SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
--   FROM api_keys
--   WHERE status = 'active' AND provider = 'lsapi'
-- ),
-- users_to_assign AS (
--   SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
--   FROM users
-- )
-- UPDATE api_keys ak
-- SET
--   status = 'assigned',
--   assigned_user_id = u.id,
--   assigned_at = NOW()
-- FROM users_to_assign u
-- JOIN available_keys avk ON u.rn = avk.rn
-- WHERE ak.id = avk.id;
--
-- -- 预览后确认
-- -- ROLLBACK;
-- -- COMMIT;

-- ============================================
-- ✅ 第四步：验证更换结果
-- ============================================

-- 验证特定用户的密钥
SELECT
  u.id,
  u.name,
  u.phone,
  ak.id as key_id,
  LEFT(ak.key_value, 10) || '...' || RIGHT(ak.key_value, 8) as key_preview,
  ak.provider,
  ak.status,
  ak.assigned_at
FROM users u
LEFT JOIN api_keys ak ON u.id = ak.assigned_user_id
WHERE u.phone = '替换为手机号'  -- 或使用 u.id = '用户ID'
AND ak.status = 'assigned';

-- 查看所有用户的密钥分配情况
SELECT
  u.name,
  u.phone,
  LEFT(ak.key_value, 10) || '...' as key_preview,
  ak.provider,
  ak.assigned_at
FROM users u
LEFT JOIN api_keys ak ON u.id = ak.assigned_user_id AND ak.status = 'assigned'
ORDER BY ak.assigned_at DESC NULLS LAST;

-- 查看密钥库统计
SELECT
  provider,
  COUNT(CASE WHEN status = 'assigned' THEN 1 END) as 已分配,
  COUNT(CASE WHEN status = 'active' THEN 1 END) as 可用,
  COUNT(*) as 总计
FROM api_keys
GROUP BY provider
ORDER BY provider;

-- 查看最近分配的密钥
SELECT
  u.name,
  u.phone,
  LEFT(ak.key_value, 10) || '...' as key_preview,
  ak.provider,
  ak.assigned_at
FROM api_keys ak
JOIN users u ON ak.assigned_user_id = u.id
WHERE ak.status = 'assigned'
ORDER BY ak.assigned_at DESC
LIMIT 10;

-- ============================================
-- 📊 有用的查询
-- ============================================

-- 查找没有分配密钥的用户
SELECT
  u.id,
  u.name,
  u.phone,
  u.created_at
FROM users u
LEFT JOIN api_keys ak ON u.id = ak.assigned_user_id AND ak.status = 'assigned'
WHERE ak.id IS NULL
ORDER BY u.created_at DESC;

-- 统计每个用户分配的密钥数量（应该都是1）
SELECT
  u.id,
  u.name,
  u.phone,
  COUNT(ak.id) as key_count
FROM users u
LEFT JOIN api_keys ak ON u.id = ak.assigned_user_id AND ak.status = 'assigned'
GROUP BY u.id, u.name, u.phone
HAVING COUNT(ak.id) > 1 OR COUNT(ak.id) = 0;
