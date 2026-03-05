# ZeoCanvasLite（基于 studio）改造设计稿

> 日期：2026-03-05  
> 仅用于执行准备，不改代码

## 目录与边界

- 父目录：`/Users/g/Desktop/探索`
- 源项目（当前 ZeoCanvas）：`/Users/g/Desktop/探索/studio`
- 目标产物目录（新仓库落位）：`/Users/g/Desktop/探索/ZeoCanvasLite`
- 本次输出：改造设计 + 执行计划 + 文件清单（不实施）

## 目标

将 `studio` 精简为单用户本地可运行版本，保留“画布 + AI 生成”，移除“用户体系/支付积分/多租户数据层”。

保留能力：
- 画布编辑与节点流转（`StudioTab` 为核心）
- 图像/视频/音频生成能力
- 基础助手与媒体代理（`/api/studio/chat`、`/api/studio/proxy`）

移除能力：
- 登录注册、短信验证码、Session
- 充值支付、余额与积分体系
- Supabase 用户与配置管理
- 与“用户身份强绑定”的同步链路（studio sync / user profile / apikey 分配）

## 方案对比（执行路径）

### 方案 A：复制后逐步剥离（推荐）

- 做法：将 `studio` 复制为 `ZeoCanvasLite` 基线，在新目录删改模块。
- 优点：保留已验证的画布与模型调用细节，风险最低。
- 缺点：前期会保留一些历史代码，需要分阶段清理。

### 方案 B：全新 Next.js 工程后按需迁移

- 做法：新建空工程，只拷贝画布核心与服务层。
- 优点：包袱最小，结构更“干净”。
- 缺点：回归风险高，迁移期容易漏掉隐性依赖。

### 方案 C：保留 studio 单仓，开 lite 分支

- 做法：在 `studio` 内分支改造。
- 优点：省复制成本。
- 缺点：与“ZeoCanvasLite 独立仓库”目标冲突，后续治理复杂。

推荐：**方案 A**。

## 目标架构（Lite）

```
ZeoCanvasLite
├── src/app
│   ├── page.tsx                      # 直接进入画布
│   ├── api/generate/image/route.ts
│   ├── api/generate/video/route.ts
│   ├── api/generate/audio/route.ts
│   ├── api/studio/chat/route.ts      # 可保留
│   └── api/studio/proxy/route.ts     # 可保留
├── src/components/studio             # 画布核心
├── src/lib/ai-client.ts              # 新增：统一取 key + provider 调用
├── src/lib/storage-lite.ts           # 新增：本地存储/文件存储抽象
└── config/ai-providers.ts            # 新增：本地配置
```

## 关键设计决策

1. 鉴权去除策略  
`getAssignedGatewayKey()` 从“Session + Supabase 分配 key”改为“直接读取本地 env/config key”。

2. API 收敛策略  
逐步把 `/api/studio/image|video` 与 `/api/audio/*` 收敛到 `/api/generate/*`，保留兼容路由一版。

3. UI 去用户化策略  
移除 `LoginModal / UserInfoWidget / UserInfoModal / Recharge` 入口，改为“本地模式配置提示”。

4. 存储策略  
前端保持 IndexedDB（`storage.ts`）用于画布数据；服务端媒体先保留 COS 兼容，再可选切到本地 `assets/`。

## 风险与缓解

- 风险：`StudioTab` 对用户/积分依赖较深。  
  缓解：先以“空实现适配层”替换依赖，再删 UI 与服务。

- 风险：路由改名导致前端调用断裂。  
  缓解：先加兼容别名路由，完成迁移后再删除旧路由。

- 风险：一次性删除过多导致无法启动。  
  缓解：按“可启动优先”分阶段：先启动、再生成、再清理。

## 完成定义（DoD）

- `npm run dev` 可启动并进入画布主页
- 画布基础交互可用（新增节点、连线、保存）
- 至少 1 条图像 + 1 条视频 + 1 条音频生成链路可通
- 不再依赖 NextAuth / Supabase / Payment 路由
- `npm run lint` 与 `npm run build` 通过
