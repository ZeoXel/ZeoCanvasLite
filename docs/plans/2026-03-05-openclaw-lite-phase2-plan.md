# OpenClaw-Oriented Lite Phase 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在保持 `/canvas` 正常运行的前提下，进一步精简 ZeoCanvasLite，使其成为可供 OpenClaw 团队协作接入的稳定“生产执行内核”。

**Architecture:** 保留“画布 + 生成 API + 同步/素材上传”最小闭环，收敛 API 入口、移除残余历史模块、建立面向 OpenClaw 的任务合同层。采用“兼容层→替换层→删除层”三阶段，降低回归风险。

**Tech Stack:** Next.js 16、React 19、TypeScript、现有 providers（OpenAI/Volcengine/Vidu/MiniMax/Suno）、COS 存储（可选本地适配）。

---

## 依据（OpenClaw 目标）

- 协作入口在飞书，OpenClaw 负责自动执行，画布是生产控制台。
- 工作站只做执行与可视化，不承担模型训练推理。
- ZeoCanvas-Lite 目标应保留画布核心与生成能力，移除用户/支付/多租户复杂性。

参考文档：
- `OpenClaw/AI短剧生产自动化工作站方案（执行目标文档）.md`
- `OpenClaw/ZeoCanvas简化改造方案.md`
- `OpenClaw/执行任务列表.md`

---

## 方案对比

### 方案 A：继续“软兼容”保留全部历史 API（不推荐）

- 优点：短期改动少。
- 缺点：结构继续膨胀，OpenClaw 接口语义不清晰，后续维护成本高。

### 方案 B：一步到位硬切（高风险）

- 优点：结构最干净。
- 缺点：一次性改动过大，容易影响现有画布流程。

### 方案 C：分阶段硬化收敛（推荐）

- 优点：每阶段可验证、可回退，最终得到“画布执行内核 + OpenClaw 合同层”。
- 缺点：需要 2-3 轮迭代。

---

## 推荐执行路径（方案 C）

### Task 1: API 合同层收敛（先做）

**目标：** 统一对外接口，减少 OpenClaw 侧适配复杂度。

**Files:**
- Create: `src/app/api/generate/image/route.ts`
- Create: `src/app/api/generate/video/route.ts`
- Create: `src/app/api/generate/audio/route.ts`
- Create: `src/app/api/task/route.ts`
- Create: `src/app/api/task/[id]/route.ts`
- Modify: `src/app/api/studio/image/route.ts`
- Modify: `src/app/api/studio/video/route.ts`
- Modify: `src/app/api/audio/minimax/route.ts`
- Modify: `src/app/api/audio/suno/route.ts`
- Create: `docs/api/openclaw-contract.md`

**Step 1:** 新增 `generate/*` 统一入口，先通过 re-export/adapter 复用现有实现。

**Step 2:** 新增 `task` 合同接口（提交/查询），返回统一字段：`taskId/status/provider/result/error`。

**Step 3:** `studio/*` 和 `audio/*` 作为兼容层保留一个阶段，文档标注 deprecated。

**Step 4:** 编写 API 合同文档，固定请求/响应格式与错误码。

**Step 5:** 运行 `npm run build` 与 curl 合同检查。

---

### Task 2: 清理残余死代码与旧能力面

**目标：** 移除对当前目标无价值的模块，降低复杂度。

**Files (候选):**
- Delete: `src/services/gatewayUsageService.ts`
- Delete: `src/services/taskPollingService.ts`
- Delete: `src/hooks/useAsyncWorkflow.ts`
- Delete: `src/services/studioSyncService.ts`（若仅保留 sync-cos）
- Delete: `src/services/coze/workflowClientService.ts`（若画布内不再直接用）
- Delete: `src/services/coze/index.ts`（按依赖裁剪）
- Delete: `src/components/studio/UserAvatar.tsx`（若无引用）
- Delete: `src/components/Button.tsx`
- Delete: `src/components/Logo.tsx`

**Step 1:** 做“引用即保留”扫描（`rg`）生成删除白名单。

**Step 2:** 分批删除，每批后执行 `npm run build`。

**Step 3:** 更新导出 barrel 文件，避免悬空导出。

**Step 4:** 记录每批删减结果到 `docs/plans/` 日志。

---

### Task 3: 存储与同步策略简化

**目标：** 明确单机工作站默认路径，避免混合策略复杂化。

**Files:**
- Modify: `src/services/cosStorage.ts`
- Modify: `src/services/cosStorageServer.ts`
- Modify: `src/app/api/cos/sts/route.ts`
- Modify: `src/app/api/studio/upload/route.ts`
- Modify: `src/app/api/studio/sync-cos/route.ts`
- Create: `src/config/runtime-mode.ts`

**Step 1:** 增加 `RUNTIME_STORAGE_MODE=cos|local`，默认 `cos`，预留本地模式。

**Step 2:** 所有上传/同步走同一适配层，禁止页面端分叉逻辑。

**Step 3:** 失败回退策略统一（返回 provider URL 或本地路径）。

**Step 4:** 验证大文件上传、同步、页面刷新恢复。

---

### Task 4: OpenClaw 集成就绪性（MVP）

**目标：** 满足执行任务列表中的 ZeoCanvasClient 对接前提。

**Files:**
- Create: `src/app/api/openclaw/submit/route.ts`
- Create: `src/app/api/openclaw/status/[id]/route.ts`
- Create: `src/app/api/openclaw/result/[id]/route.ts`
- Create: `src/types/openclaw.ts`
- Create: `docs/api/openclaw-mvp.md`

**Step 1:** 抽象统一任务模型（图/视/音一致状态机）。

**Step 2:** 提供最小 3 个接口：提交、状态、结果。

**Step 3:** 设计幂等 key 与错误语义，便于 OpenClaw 重试。

**Step 4:** 补充最小端到端脚本（curl 级别）。

---

## 验收标准（DoD）

1. 用户访问面仅 `/` 与 `/canvas` 有效；历史页面不再存在。  
2. 对外生成接口收敛到 `generate/*` 与 `task/*`。  
3. `npm run build` 持续通过。  
4. OpenClaw 能以统一合同提交并追踪至少 1 条图像/视频/音频任务。  
5. 代码树中不再残留 auth/payment/user/dashboard 旧链路引用。

---

## 里程碑建议

- Milestone 1（1-2 天）：Task 1 完成，API 合同固定。  
- Milestone 2（1 天）：Task 2 完成，代码体积显著下降。  
- Milestone 3（1-2 天）：Task 3 完成，存储/同步策略单一化。  
- Milestone 4（2 天）：Task 4 完成，OpenClaw MVP 接入演示。

