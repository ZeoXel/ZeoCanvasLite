# ZeoCanvasLite From Studio Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 从 `studio` 精简出独立的 `ZeoCanvasLite`，保留画布与 AI 生成能力，移除用户/支付/积分/多租户依赖。  
**Architecture:** 以 `studio` 为迁移基线，在 `ZeoCanvasLite` 内分阶段“先可运行、再可生成、再去冗余”。先替换鉴权取 key 链路，再收敛 API，最后做 UI 与依赖清理，确保每阶段可验证。  
**Tech Stack:** Next.js 16、React 19、TypeScript、现有 providers（veo/seedance/vidu/suno/minimax）、本地 env 配置。

---

## 目录约束（执行时固定）

- 父目录：`/Users/g/Desktop/探索`
- 源目录（只读基线）：`/Users/g/Desktop/探索/studio`
- 目标目录（开发仓库）：`/Users/g/Desktop/探索/ZeoCanvasLite`

### Task 1: 建立 Lite 基线目录

**Files:**
- Create: `scripts/bootstrap-from-studio.sh`
- Create: `docs/plans/2026-03-05-bootstrap-log.md`
- Verify: `package.json`, `src/**`（复制后）

**Step 1: 写基线复制脚本（不复制运行缓存）**

```bash
#!/usr/bin/env bash
set -euo pipefail
SRC="/Users/g/Desktop/探索/studio"
DST="/Users/g/Desktop/探索/ZeoCanvasLite"
rsync -a --delete \
  --exclude '.git' --exclude 'node_modules' --exclude '.next' \
  "$SRC/" "$DST/"
```

**Step 2: 执行脚本并记录复制结果**

Run: `bash scripts/bootstrap-from-studio.sh`  
Expected: `ZeoCanvasLite` 出现完整 `src/`、`package.json`、`next.config.ts`。

**Step 3: 基线完整性检查**

Run: `rg --files src | wc -l`  
Expected: 文件数 > 150（数量级与源项目接近）。

**Step 4: 记录日志**

写入 `docs/plans/2026-03-05-bootstrap-log.md`：复制时间、命令、文件数。

**Step 5: Commit**

```bash
git add .
git commit -m "chore: bootstrap zeocanvaslite from studio baseline"
```

### Task 2: 去除全局鉴权 Provider 链路

**Files:**
- Modify: `src/app/Providers.tsx`
- Modify: `src/app/layout.tsx`
- Delete: `src/contexts/AuthContext.tsx`
- Delete: `src/contexts/UserDataContext.tsx`
- Delete: `src/contexts/TaskLogContext.tsx`

**Step 1: 先写失败验证（当前依赖 next-auth）**

Run: `rg -n "next-auth|SessionProvider|AuthProvider|UserDataProvider|TaskLogProvider" src/app src/contexts`  
Expected: 能看到多处命中（证明旧链路存在）。

**Step 2: 改造 Providers 为最小壳层**

```tsx
"use client";
import { ReactNode } from 'react';
import StudioSyncProvider from '@/components/StudioSyncProvider';
export default function Providers({ children }: { children: ReactNode }) {
  return <StudioSyncProvider>{children}</StudioSyncProvider>;
}
```

**Step 3: 清理对 `useAuth/useUserData` 的直接引用点（先占位）**

Run: `rg -n "useAuth|useUserData" src`  
Expected: 剩余命中仅在后续 Task 处理范围内。

**Step 4: 启动检查**

Run: `npm run dev`  
Expected: 编译错误集中在 `StudioTab` 与用户信息组件（可预期）。

**Step 5: Commit**

```bash
git add src/app src/contexts
git commit -m "refactor: remove global auth providers in lite mode"
```

### Task 3: 替换 API Key 解析（移除 Session + Supabase）

**Files:**
- Modify: `src/lib/server/assignedKey.ts`
- Create: `src/config/ai-providers.ts`
- Create: `src/lib/ai-client.ts`

**Step 1: 写失败用例（未配置 key 时返回明确错误）**

```ts
// tests/config/ai-client.test.ts
import { describe, it, expect } from 'vitest';
import { resolveProviderKey } from '@/lib/ai-client';

describe('resolveProviderKey', () => {
  it('throws when no key configured', () => {
    expect(() => resolveProviderKey('openai')).toThrow();
  });
});
```

**Step 2: 运行失败测试**

Run: `npm run test -- tests/config/ai-client.test.ts`  
Expected: FAIL（函数尚未实现）。

**Step 3: 实现最小替代逻辑**

```ts
// assignedKey.ts
export async function getAssignedGatewayKey() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.VOLCENGINE_API_KEY || null;
  return { userId: 'local-user', apiKey };
}
```

**Step 4: 回归路由编译**

Run: `npm run build`  
Expected: 不再因 `next-auth`/`supabase` 缺失导致 server import 报错。

**Step 5: Commit**

```bash
git add src/lib/server/assignedKey.ts src/config/ai-providers.ts src/lib/ai-client.ts tests/config/ai-client.test.ts
git commit -m "refactor: replace session key assignment with local env resolver"
```

### Task 4: API 收敛到 `/api/generate/*` 并保留兼容路由

**Files:**
- Create: `src/app/api/generate/image/route.ts`
- Create: `src/app/api/generate/video/route.ts`
- Create: `src/app/api/generate/audio/route.ts`
- Modify: `src/app/api/studio/image/route.ts`（转发到 generate）
- Modify: `src/app/api/studio/video/route.ts`（转发到 generate）
- Modify: `src/app/api/audio/minimax/route.ts`、`src/app/api/audio/suno/route.ts`（统一入口）

**Step 1: 写失败 contract 测试（路径必须存在）**

```ts
// tests/contracts/generate-routes.test.ts
import { describe, it, expect } from 'vitest';

describe('generate route contract', () => {
  it('expects /api/generate/image to exist', async () => {
    const res = await fetch('http://localhost:3000/api/generate/image', { method: 'POST', body: '{}' });
    expect([200, 400, 401, 500]).toContain(res.status);
  });
});
```

**Step 2: 运行测试确认失败**

Run: `npm run test -- tests/contracts/generate-routes.test.ts`  
Expected: FAIL（路由未创建）。

**Step 3: 实现新路由并让旧路由转发**

```ts
// studio/image route.ts
export { POST } from '@/app/api/generate/image/route';
```

**Step 4: 手工联调**

Run: 
- `curl -i -X POST http://localhost:3000/api/generate/image -H 'content-type: application/json' -d '{"prompt":"test"}'`
- `curl -i -X POST http://localhost:3000/api/studio/image -H 'content-type: application/json' -d '{"prompt":"test"}'`

Expected: 两条路径都有业务响应（至少不 404）。

**Step 5: Commit**

```bash
git add src/app/api/generate src/app/api/studio src/app/api/audio tests/contracts/generate-routes.test.ts
git commit -m "feat: add unified generate routes with backward-compatible aliases"
```

### Task 5: 画布 UI 去用户化与去支付化

**Files:**
- Modify: `src/components/studio/StudioTab.tsx`
- Delete: `src/components/studio/LoginModal.tsx`
- Delete: `src/components/studio/UserInfoWidget.tsx`
- Delete: `src/components/studio/UserInfoModal.tsx`
- Delete: `src/components/recharge/**`
- Delete: `src/hooks/useRecharge.ts`
- Delete: `src/components/common/AuthRequiredNotice.tsx`

**Step 1: 搜索所有用户/积分 UI 依赖点**

Run: `rg -n "useAuth|useUserData|LoginModal|UserInfo|Recharge|credits|balance" src/components/studio src/hooks`  
Expected: 列出待清理引用。

**Step 2: 先做最小替换（显示本地模式标签）**

```tsx
// StudioTab 中替代用户态入口
<div className="text-xs text-gray-400">Local Mode</div>
```

**Step 3: 删除组件并修复 import**

Run: `rg -n "LoginModal|UserInfoWidget|UserInfoModal|AuthRequiredNotice|useRecharge" src`  
Expected: 0 命中。

**Step 4: 画布回归检查**

Run: `npm run dev`，手工检查：
- 打开 `/canvas`
- 创建节点
- 触发一次图像生成

Expected: 无登录弹窗、无充值入口、主流程可走通。

**Step 5: Commit**

```bash
git add src/components/studio src/components/recharge src/hooks src/components/common
git commit -m "refactor: remove auth and recharge UI from studio canvas"
```

### Task 6: 删除不再需要的路由和服务模块

**Files:**
- Delete: `src/app/(auth)/**`
- Delete: `src/app/(dashboard)/**`
- Delete: `src/app/pay-result/**`
- Delete: `src/app/api/auth/**`
- Delete: `src/app/api/payment/**`
- Delete: `src/app/api/user/**`
- Delete: `src/lib/auth.ts`
- Delete: `src/lib/supabase.ts`
- Delete: `src/lib/services/**`
- Delete: `src/services/paymentService.ts`
- Delete: `src/services/creditsService.ts`
- Delete: `src/services/creditsEvents.ts`
- Delete: `src/services/userApiService.ts`
- Delete: `src/services/userKeyService.ts`

**Step 1: 写失败检查（确认旧模块仍存在）**

Run: `rg --files src/app/api/payment src/lib/services src/app/(auth) src/app/(dashboard)`  
Expected: 有输出。

**Step 2: 删除文件并修复引用**

Run: `rg -n "@/lib/auth|@/lib/supabase|paymentService|creditsService|userKeyService" src`  
Expected: 0 命中。

**Step 3: 依赖清理**

Modify `package.json` 删除：`next-auth`, `@supabase/supabase-js`, `alipay-sdk`, `qrcode.react`（若无引用）。

**Step 4: 构建验证**

Run: `npm run lint && npm run build`  
Expected: 通过。

**Step 5: Commit**

```bash
git add src package.json package-lock.json
git commit -m "chore: remove auth payment supabase modules for lite architecture"
```

### Task 7: 增加 OpenClaw 对接端点（最小版）

**Files:**
- Create: `src/app/api/task/route.ts`
- Create: `src/app/api/task/store.ts`
- Optional Create: `src/app/api/ws/route.ts`（若 runtime 允许）

**Step 1: 写失败 contract 检查**

Run: `curl -i -X POST http://localhost:3000/api/task -H 'content-type: application/json' -d '{"type":"image","prompt":"test"}'`  
Expected: 初始应 404。

**Step 2: 实现最小任务提交/查询**

```ts
// /api/task/route.ts
// POST: create taskId + pending
// GET: by taskId return status/result
```

**Step 3: 联调**

Run:
- `curl -i -X POST .../api/task ...`
- `curl -i 'http://localhost:3000/api/task?taskId=xxx'`

Expected: 可获得稳定 JSON 合同。

**Step 4: 错误分支验证**

Run: `curl -i 'http://localhost:3000/api/task'`  
Expected: 400（缺少 taskId）。

**Step 5: Commit**

```bash
git add src/app/api/task
git commit -m "feat: add minimal task api for openclaw integration"
```

### Task 8: 最终验收与交接

**Files:**
- Create: `docs/plans/2026-03-05-zeocanvaslite-acceptance.md`
- Create: `.env.example`（Lite 版）

**Step 1: 生成 Lite 环境变量模板**

```bash
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.lsaigc.com
VOLCENGINE_API_KEY=
GATEWAY_BASE_URL=https://api.lsaigc.com
```

**Step 2: 执行完整验证命令**

Run:
- `npm ci`
- `npm run lint`
- `npm run build`
- `npm run dev`

Expected: 全部通过，页面可访问。

**Step 3: 端到端 smoke**

Run:
- 图像：`/api/generate/image`
- 视频：`/api/generate/video`
- 音频：`/api/generate/audio`
- 任务：`/api/task`

Expected: 全部非 404，错误与成功返回格式稳定。

**Step 4: 交接记录**

写入 `acceptance.md`：命令结果、已删除模块、遗留风险。

**Step 5: Commit**

```bash
git add .
git commit -m "docs: finalize zeocanvaslite acceptance and handoff notes"
```

