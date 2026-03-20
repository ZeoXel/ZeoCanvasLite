# ZeoCanvas Lite

[English](#english) | [中文](#中文)

---

## English

An AI-powered creative canvas studio built with Next.js. Compose, generate, and iterate on images, videos, and audio using a node-based visual workspace — all in one place.

> **Lite mode:** runs fully offline with zero external dependencies. No Supabase, no cloud storage, no API keys required to start.

## Features

- **Node-based Canvas** — drag-and-drop editor for building multi-step AI creative workflows; nodes connect via typed ports
- **Image Generation** — Nano Banana, Seedream, and more; aspect ratio control, batch output, reference image support
- **Video Generation** — Veo, Seedance, Vidu, Minimax; first/last-frame conditioning, multi-image reference
- **Audio Generation** — Suno music generation and MiniMax text-to-speech
- **Subject Library** — manage reusable characters and objects; reference them in any node via `@mention`
- **Canvas Persistence** — IndexedDB-backed local storage; optional COS cloud sync across devices
- **User Accounts** — phone/SMS authentication via NextAuth + Supabase (optional, off by default)
- **Credits System** — Alipay and WeChat Pay integration; per-node credit pricing (optional)
- **Coze Workflows** — run and monitor Coze AI workflows from within the studio
- **Dashboard** — canvas history, task logs, credit balance, and profile management

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, standalone output) |
| UI | React 19, Tailwind CSS, Headless UI, Lucide |
| State | Custom hooks + module-level memory cache (zero-delay reload) |
| Local Storage | IndexedDB (user-scoped keys via `storageScope.ts`) |
| Auth | NextAuth v4 + Supabase (optional) |
| Database | Supabase (PostgreSQL, optional) |
| Cloud Storage | Tencent Cloud COS (optional) |
| Charts | VChart / VisActor |
| 3D | Three.js |
| Runtime | Node 20 / Bun |

## Quick Start (Local Mode — no backend required)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Canvases are saved to IndexedDB in your browser. No sign-in, no cloud setup needed.

## Full Setup

### Prerequisites

- Node.js 20+ or Bun
- *(optional)* Supabase project — for auth + cross-device sync
- *(optional)* Tencent Cloud COS bucket — for media file storage
- *(optional)* AI provider API keys — for generation features

### Install

```bash
npm install
# or
bun install
```

### Environment Variables

Create a `.env.local` at the project root. All variables are optional in local mode.

```env
# --- Feature Flags ---
# Set to 'true' to enable login/registration UI
NEXT_PUBLIC_ENABLE_AUTH=false
# Set to 'true' to enable COS cloud sync
NEXT_PUBLIC_ENABLE_CLOUD_SYNC=false

# --- AI Gateway (OpenAI-compatible) ---
NEXT_PUBLIC_OPENAI_API_KEY=
NEXT_PUBLIC_OPENAI_BASE_URL=

# --- Supabase (required only when ENABLE_AUTH=true) ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# --- NextAuth (required only when ENABLE_AUTH=true) ---
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# --- Tencent Cloud COS (required only when ENABLE_CLOUD_SYNC=true) ---
COS_SECRET_ID=
COS_SECRET_KEY=
NEXT_PUBLIC_COS_BUCKET=
NEXT_PUBLIC_COS_REGION=
NEXT_PUBLIC_COS_DOMAIN=

# --- Optional: gateway proxy ---
NEXT_PUBLIC_USE_GATEWAY_PROXY=false
NEXT_PUBLIC_GATEWAY_PROXY_BASE=

# --- Optional: Alipay / WeChat Pay ---
ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=
WECHAT_MCH_ID=
WECHAT_API_KEY=
```

### Database Setup (optional, auth mode only)

Run the SQL scripts in `supabase/` against your Supabase project in order:

```
supabase/optimized-schema.sql
supabase/create-verification-codes-table.sql
supabase/performance-indexes.sql
```

### Development

```bash
npm run dev
# or, to strip system proxy (macOS):
./dev.sh
```

### Build

```bash
npm run build
npm run start
```

## Docker Deployment

Build the image:

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
  -t zeocanvas-lite .
```

Run with Docker Compose (copy and fill `.env.production` first):

```bash
docker compose -f docker-compose.vps.yml up -d
```

The container exposes port `3000` with a health check at `/api/health`.

## Architecture Highlights

**Zero-dependency local mode** — `NEXT_PUBLIC_ENABLE_AUTH` and `NEXT_PUBLIC_ENABLE_CLOUD_SYNC` flags gate all external service calls at the module level. When disabled, `uploadToCos` returns data URLs directly and `StudioSyncProvider` skips all COS fetch/push, so the app is fully self-contained.

**Memory cache layer** — `studioCache.ts` holds a module-level in-memory snapshot of canvas state. Canvas loads read from cache first (zero latency), then hydrate from IndexedDB in the background. This eliminates the blank-canvas flash on navigation.

**User-scoped storage** — all IndexedDB keys are namespaced by user ID via `storageScope.ts` (e.g., `canvases:user-123`). Anonymous users get the `anonymous` namespace, making multi-user support on the same device seamless.

**Canvas sync strategy** — `StudioSyncProvider` uses a simple timestamp comparison: pull on entry if server is newer, push on exit (via `sendBeacon` for reliability). No polling, no conflict resolution complexity.

**Node type system** — each canvas node has a `type` field that maps to a React component via the node registry. Adding a new AI provider is one file: a node component + an entry in `src/config/models/`.

## Customization

**Branding** — edit `src/config/brand.ts` to change the app name, slogan, and logo paths.

**AI Models** — add or remove providers in `src/config/models/` (image, video, audio).

**Gateway** — update `src/config/gateway.config.ts` to point at your API gateway endpoint and set the credit conversion rate.

**Pricing** — adjust per-node credit costs in `src/config/pricing/node-pricing.json`.

## Project Structure

```
src/
├── app/                  # Next.js App Router pages and API routes
│   ├── (auth)/           # Login, SSO pages
│   ├── (dashboard)/      # Canvases, tasks, profile, workflow
│   ├── canvas/           # Main canvas editor
│   └── api/              # Server routes (studio, auth, payment, coze…)
├── components/
│   ├── studio/           # Canvas nodes, panels, subject editor, charts
│   └── ui/               # Shared UI primitives
├── config/               # Brand, gateway, model registry, pricing
├── contexts/             # Auth, user data, task log providers
├── hooks/                # Canvas state, viewport, interaction hooks
├── lib/                  # Supabase client, auth config, backend services
├── services/             # AI provider adapters, storage, payments
└── types/                # Shared TypeScript types
supabase/                 # SQL migration scripts
```

## License

Private — all rights reserved.

---

## 中文

基于 Next.js 构建的 AI 创意画布工作室。通过节点式可视化工作区，在一处完成图片、视频、音频的组合、生成与迭代。

> **Lite 模式：** 无需任何外部服务即可本地运行。无需 Supabase、无需云存储、无需 API Key 即可启动。

## 功能特性

- **节点式画布** — 拖拽编辑器，构建多步骤 AI 创意工作流；节点间通过类型化端口连接
- **图片生成** — 支持 Nano Banana、Seedream 等，可控宽高比、批量输出、参考图
- **视频生成** — 支持 Veo、Seedance、Vidu、Minimax，支持首尾帧控制、多图参考
- **音频生成** — Suno 音乐生成与 MiniMax 文本转语音
- **主体库** — 管理可复用的角色与对象，支持在任意节点用 `@提及` 方式引用
- **画布持久化** — IndexedDB 本地存储；可选 COS 云端跨设备同步
- **用户账户** — 手机号 / 短信验证码登录（NextAuth + Supabase，可选，默认关闭）
- **积分系统** — 支付宝与微信支付充值，按节点计费（可选）
- **Coze 工作流** — 在 Studio 内直接运行和监控 Coze AI 工作流
- **控制台** — 画布历史、任务日志、积分余额与个人信息管理

## 技术栈

| 层级 | 技术 |
|---|---|
| 框架 | Next.js 16（App Router，standalone 输出） |
| UI | React 19、Tailwind CSS、Headless UI、Lucide |
| 状态管理 | 自定义 Hook + 模块级内存缓存（零延迟重载） |
| 本地存储 | IndexedDB（通过 `storageScope.ts` 实现用户隔离） |
| 认证 | NextAuth v4 + Supabase（可选） |
| 数据库 | Supabase（PostgreSQL，可选） |
| 云存储 | 腾讯云 COS（可选） |
| 图表 | VChart / VisActor |
| 3D | Three.js |
| 运行时 | Node 20 / Bun |

## 快速开始（本地模式，无需任何后端）

```bash
npm install
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)。画布数据存储在浏览器 IndexedDB 中，无需登录，无需云服务配置。

## 完整部署

### 前置要求

- Node.js 20+ 或 Bun
- *(可选)* Supabase 项目 — 用于认证与跨设备同步
- *(可选)* 腾讯云 COS 存储桶 — 用于媒体文件存储
- *(可选)* AI 服务商 API Key — 用于生成功能

### 安装依赖

```bash
npm install
# 或
bun install
```

### 环境变量

在项目根目录创建 `.env.local`，本地模式下所有变量均为可选。

```env
# --- 功能开关 ---
# 设为 'true' 启用登录/注册 UI
NEXT_PUBLIC_ENABLE_AUTH=false
# 设为 'true' 启用 COS 云同步
NEXT_PUBLIC_ENABLE_CLOUD_SYNC=false

# --- AI 网关（OpenAI 兼容） ---
NEXT_PUBLIC_OPENAI_API_KEY=
NEXT_PUBLIC_OPENAI_BASE_URL=

# --- Supabase（仅 ENABLE_AUTH=true 时需要） ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# --- NextAuth（仅 ENABLE_AUTH=true 时需要） ---
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# --- 腾讯云 COS（仅 ENABLE_CLOUD_SYNC=true 时需要） ---
COS_SECRET_ID=
COS_SECRET_KEY=
NEXT_PUBLIC_COS_BUCKET=
NEXT_PUBLIC_COS_REGION=
NEXT_PUBLIC_COS_DOMAIN=

# --- 可选：API 网关代理 ---
NEXT_PUBLIC_USE_GATEWAY_PROXY=false
NEXT_PUBLIC_GATEWAY_PROXY_BASE=

# --- 可选：支付宝 / 微信支付 ---
ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=
WECHAT_MCH_ID=
WECHAT_API_KEY=
```

### 数据库初始化（可选，仅认证模式需要）

按顺序在 Supabase 项目中执行 `supabase/` 目录下的 SQL 脚本：

```
supabase/optimized-schema.sql
supabase/create-verification-codes-table.sql
supabase/performance-indexes.sql
```

### 本地开发

```bash
npm run dev
# 或（macOS 下去除系统代理）：
./dev.sh
```

### 构建

```bash
npm run build
npm run start
```

## Docker 部署

构建镜像：

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
  -t zeocanvas-lite .
```

使用 Docker Compose 运行（先复制并填写 `.env.production`）：

```bash
docker compose -f docker-compose.vps.yml up -d
```

容器暴露 `3000` 端口，健康检查地址为 `/api/health`。

## 架构设计亮点

**零依赖本地模式** — `NEXT_PUBLIC_ENABLE_AUTH` 与 `NEXT_PUBLIC_ENABLE_CLOUD_SYNC` 在模块级别控制所有外部服务调用。关闭时，`uploadToCos` 直接返回 data URL，`StudioSyncProvider` 跳过全部 COS 操作，应用完全自包含运行。

**内存缓存层** — `studioCache.ts` 维护画布状态的模块级内存快照。画布加载优先读缓存（零延迟），后台异步从 IndexedDB 补全。消除了页面切换时的画布空白闪烁。

**用户隔离存储** — 所有 IndexedDB 键通过 `storageScope.ts` 按用户 ID 命名空间隔离（如 `canvases:user-123`）。匿名用户使用 `anonymous` 命名空间，同设备多用户无缝切换。

**画布同步策略** — `StudioSyncProvider` 采用时间戳比较：进入时若服务端更新则拉取，离开时通过 `sendBeacon` 推送（保证页面关闭时可靠发送）。无轮询，无冲突合并复杂度。

**节点类型系统** — 每个画布节点通过 `type` 字段映射到 React 组件（节点注册表）。新增 AI 服务商只需一个文件：节点组件 + `src/config/models/` 中的一条配置。

## 自定义配置

**品牌** — 修改 `src/config/brand.ts` 可更换应用名称、Slogan 与 Logo 路径。

**AI 模型** — 在 `src/config/models/` 中新增或删除图片、视频、音频服务商。

**网关** — 修改 `src/config/gateway.config.ts` 配置 API 网关地址与积分换算比例。

**定价** — 在 `src/config/pricing/node-pricing.json` 中调整各节点的积分消耗。

## 项目结构

```
src/
├── app/                  # Next.js App Router 页面与 API 路由
│   ├── (auth)/           # 登录、SSO 页面
│   ├── (dashboard)/      # 画布列表、任务、个人信息、工作流
│   ├── canvas/           # 主画布编辑器
│   └── api/              # 服务端路由（studio、认证、支付、coze…）
├── components/
│   ├── studio/           # 画布节点、面板、主体编辑器、图表
│   └── ui/               # 通用 UI 组件
├── config/               # 品牌、网关、模型注册表、定价
├── contexts/             # 认证、用户数据、任务日志 Context
├── hooks/                # 画布状态、视口、交互 Hook
├── lib/                  # Supabase 客户端、认证配置、后端服务
├── services/             # AI 服务商适配器、存储、支付
└── types/                # 共享 TypeScript 类型
supabase/                 # SQL 迁移脚本
```

## 许可证

私有项目，保留所有权利。
