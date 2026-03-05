-- ============================================
-- 用户密钥 Provider 修改工具脚本
-- ============================================

-- 1️⃣ 查看当前所有已分配密钥的 provider 分布
SELECT
  provider,
  COUNT(*) as total_count,
  COUNT(CASE WHEN status = 'assigned' THEN 1 END) as assigned_count,
  COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count
FROM api_keys
GROUP BY provider
ORDER BY provider;

-- 2️⃣ 查看具体每个用户使用的密钥和 provider
SELECT
  u.id as user_id,
  u.name,
  u.phone,
  u.short_id,
  ak.id as key_id,
  LEFT(ak.key_value, 10) || '...' as key_preview,
  ak.provider,
  ak.status,
  ak.assigned_at
FROM users u
LEFT JOIN api_keys ak ON u.id = ak.assigned_user_id AND ak.status = 'assigned'
ORDER BY u.created_at DESC;

-- ============================================
-- 修改操作 (请根据实际情况修改下面的 SQL)
-- ============================================

-- 示例1: 修改特定密钥的 provider
-- UPDATE api_keys
-- SET provider = 'lsapi'  -- 改为 Railway 网关
-- WHERE key_value = 'sk-你的密钥...';

-- 示例2: 修改特定用户的密钥 provider
-- UPDATE api_keys
-- SET provider = 'lsapi'
-- WHERE assigned_user_id = '用户ID';

-- 示例3: 通过手机号修改用户的密钥 provider
-- UPDATE api_keys
-- SET provider = 'lsapi'
-- WHERE assigned_user_id = (
--   SELECT id FROM users WHERE phone = '手机号'
-- );

-- 示例4: 批量修改所有已分配密钥的 provider
-- UPDATE api_keys
-- SET provider = 'lsapi'
-- WHERE status = 'assigned'
-- AND provider = 'bltcy';  -- 只修改原本是 bltcy 的密钥

-- ============================================
-- 验证修改结果
-- ============================================

-- 3️⃣ 再次查看 provider 分布
SELECT
  provider,
  COUNT(*) as total_count,
  COUNT(CASE WHEN status = 'assigned' THEN 1 END) as assigned_count
FROM api_keys
GROUP BY provider;

-- 4️⃣ 查看最近修改的密钥
SELECT
  ak.key_value,
  ak.provider,
  ak.status,
  u.name as user_name,
  u.phone as user_phone,
  ak.assigned_at
FROM api_keys ak
LEFT JOIN users u ON ak.assigned_user_id = u.id
WHERE ak.status = 'assigned'
ORDER BY ak.assigned_at DESC
LIMIT 10;

-- ============================================
-- 常用查询
-- ============================================

-- 5️⃣ 查找所有使用 Railway 网关的用户
-- SELECT
--   u.name,
--   u.phone,
--   LEFT(ak.key_value, 10) || '...' as key_preview
-- FROM users u
-- JOIN api_keys ak ON u.id = ak.assigned_user_id
-- WHERE ak.provider = 'lsapi'
-- AND ak.status = 'assigned';

-- 6️⃣ 查找所有使用 BLTCY 网关的用户
-- SELECT
--   u.name,
--   u.phone,
--   LEFT(ak.key_value, 10) || '...' as key_preview
-- FROM users u
-- JOIN api_keys ak ON u.id = ak.assigned_user_id
-- WHERE ak.provider = 'bltcy'
-- AND ak.status = 'assigned';
