-- 检查 provider=lsapi 的密钥分配情况
-- 用于诊断新用户是否能分配到 lsapi 密钥

-- 1. 统计各 provider 的密钥数量和状态
SELECT
  provider,
  status,
  COUNT(*) as count
FROM api_keys
GROUP BY provider, status
ORDER BY provider, status;

-- 2. 查看所有 provider=lsapi 的密钥详情
SELECT
  id,
  key_value,
  provider,
  status,
  assigned_user_id,
  assigned_at,
  created_at
FROM api_keys
WHERE provider = 'lsapi'
ORDER BY
  CASE status
    WHEN 'active' THEN 1
    WHEN 'assigned' THEN 2
    WHEN 'available' THEN 3
    WHEN 'expired' THEN 4
  END,
  id ASC;

-- 3. 查看 provider=lsapi 且状态为 active 的可用密钥（新用户会分配这些）
SELECT
  id,
  key_value,
  provider,
  status,
  created_at
FROM api_keys
WHERE provider = 'lsapi'
  AND status = 'active'
ORDER BY id ASC;

-- 4. 查看最近分配的密钥（包含用户信息）
SELECT
  ak.id as key_id,
  ak.key_value,
  ak.provider,
  ak.status,
  ak.assigned_at,
  u.id as user_id,
  u.name as user_name,
  u.phone as user_phone,
  u.created_at as user_created_at
FROM api_keys ak
LEFT JOIN users u ON ak.assigned_user_id = u.id
WHERE ak.status = 'assigned'
ORDER BY ak.assigned_at DESC
LIMIT 20;

-- 5. 查看最近注册的用户及其分配的密钥
SELECT
  u.id as user_id,
  u.name as user_name,
  u.phone as user_phone,
  u.created_at as user_created_at,
  u.assigned_key_id,
  ak.id as key_id,
  ak.key_value,
  ak.provider,
  ak.status
FROM users u
LEFT JOIN api_keys ak ON u.assigned_key_id = ak.id
ORDER BY u.created_at DESC
LIMIT 20;

-- 6. 检查是否有用户没有分配密钥
SELECT
  u.id,
  u.name,
  u.phone,
  u.created_at,
  u.assigned_key_id
FROM users u
WHERE u.assigned_key_id IS NULL
ORDER BY u.created_at DESC;

-- 7. 检查是否有密钥分配了但 users 表的 assigned_key_id 没有同步
SELECT
  ak.id as key_id,
  ak.assigned_user_id,
  ak.provider,
  ak.assigned_at,
  u.assigned_key_id as user_assigned_key_id,
  CASE
    WHEN u.assigned_key_id = ak.id THEN '✅ 同步'
    WHEN u.assigned_key_id IS NULL THEN '❌ 用户表未同步'
    ELSE '⚠️ 不一致'
  END as sync_status
FROM api_keys ak
LEFT JOIN users u ON ak.assigned_user_id = u.id
WHERE ak.status = 'assigned'
  AND ak.assigned_user_id IS NOT NULL
ORDER BY ak.assigned_at DESC;
