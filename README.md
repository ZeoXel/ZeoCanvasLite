# ZeoCanvas Lite

[English](#english) | [中文](#中文)

---

## English

An AI-powered creative canvas studio built with Next.js. Compose, generate, and iterate on images, videos, and audio using a node-based visual workspace — all in one place.

## Features

- **Canvas Workspace** — node-based editor for building multi-step AI creative workflows
- **Image Generation** — Nano Banana, Seedream, and more, with aspect ratio and batch output control
- **Video Generation** — Veo, Seedance, Vidu, Minimax; supports first/last-frame and multi-image reference
- **Audio Generation** — Suno music generation and MiniMax text-to-speech
- **Subject Library** — manage reusable characters and objects with @mention prompting
- **Canvas Sync** — auto-sync canvas state to Tencent Cloud Object Storage (COS)
- **User Accounts** — phone/SMS authentication via NextAuth + Supabase
- **Credits System** — Alipay and WeChat Pay integration; per-node credit pricing
- **Coze Workflows** — run and monitor Coze AI workflows from within the studio
- **Dashboard** — canvas history, task logs, credit balance, and profile management

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, standalone output) |
| UI | React 19, Tailwind CSS, Headless UI, Lucide |
| Auth | NextAuth v4 + Supabase |
| Database | Supabase (PostgreSQL) |
| Storage | Tencent Cloud COS |
| Charts | VChart / VisActor |
| 3D | Three.js |
| Runtime | Node 20 / Bun |

## Getting Started

### Prerequisites

- Node.js 20+ or Bun
- A Supabase project (auth + database)
- Tencent Cloud COS bucket (for canvas sync and media storage)
- API keys for the AI providers you want to use

### Install

```bash
npm install
# or
bun install
```

### Environment Variables

Create a `.env.local` file at the project root. Required variables:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# NextAuth
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# Tencent Cloud COS
COS_SECRET_ID=
COS_SECRET_KEY=
COS_BUCKET=
COS_REGION=

# AI Gateway (OpenAI-compatible)
NEXT_PUBLIC_OPENAI_API_KEY=
NEXT_PUBLIC_OPENAI_BASE_URL=

# Optional: enable gateway proxy
NEXT_PUBLIC_USE_GATEWAY_PROXY=false
NEXT_PUBLIC_GATEWAY_PROXY_BASE=

# Optional: Alipay / WeChat Pay (for credits)
ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=
WECHAT_MCH_ID=
WECHAT_API_KEY=
```

### Database Setup

Run the SQL scripts in `supabase/` against your Supabase project in order:

```bash
supabase/optimized-schema.sql          # core tables
supabase/create-verification-codes-table.sql
supabase/performance-indexes.sql
```

### Development

```bash
npm run dev
# or, to strip system proxy (macOS):
./dev.sh
```

Open [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
npm run start
```

## Docker Deployment

Build the image (pass public env vars as build args):

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

The container exposes port `3000` and includes a health check at `/api/health`.

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
├── services/             # AI provider adapters, COS storage, payments
└── types/                # Shared TypeScript types
supabase/                 # SQL migration scripts
```

## License

Private — all rights reserved.

---

## 中文

基于 Next.js 构建的 AI 创意画布工作室。通过节点式可视化工作区，在一处完成图片、视频、音频的组合、生成与迭代。

## 功能特性

- **画布工作区** — 节点编辑器，用于搭建多步骤 AI 创意工作流
- **图片生成** — 支持 Nano Banana、Seedream 等，可控宽高比与批量输出
- **视频生成** — 支持 Veo、Seedance、Vidu、Minimax，支持首尾帧与多图参考
- **音频生成** — Suno 音乐生成与 MiniMax 文本转语音
- **主体库** — 管理可复用的角色与对象，支持 @提及 方式引用
- **画布同步** — 自动将画布状态同步至腾讯云对象存储（COS）
- **用户账户** — 手机号 / 短信验证码登录（NextAuth + Supabase）
- **积分系统** — 支付宝与微信支付充值，按节点计费
- **Coze 工作流** — 在 Studio 内直接运行和监控 Coze AI 工作流
- **控制台** — 画布历史、任务日志、积分余额与个人信息管理

## 技术栈

| 层级 | 技术 |
|---|---|
| 框架 | Next.js 16（App Router，standalone 输出） |
| UI | React 19、Tailwind CSS、Headless UI、Lucide |
| 认证 | NextAuth v4 + Supabase |
| 数据库 | Supabase（PostgreSQL） |
| 存储 | 腾讯云 COS |
| 图表 | VChart / VisActor |
| 3D | Three.js |
| 运行时 | Node 20 / Bun |

## 快速开始

### 前置要求

- Node.js 20+ 或 Bun
- Supabase 项目（认证 + 数据库）
- 腾讯云 COS 存储桶（画布同步与媒体存储）
- 所需 AI 服务商的 API Key

### 安装依赖

```bash
npm install
# 或
bun install
```

### 环境变量

在项目根目录创建 `.env.local` 文件：

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# NextAuth
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# 腾讯云 COS
COS_SECRET_ID=
COS_SECRET_KEY=
COS_BUCKET=
COS_REGION=

# AI 网关（OpenAI 兼容）
NEXT_PUBLIC_OPENAI_API_KEY=
NEXT_PUBLIC_OPENAI_BASE_URL=

# 可选：启用网关代理
NEXT_PUBLIC_USE_GATEWAY_PROXY=false
NEXT_PUBLIC_GATEWAY_PROXY_BASE=

# 可选：支付宝 / 微信支付
ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=
WECHAT_MCH_ID=
WECHAT_API_KEY=
```

### 数据库初始化

按顺序在 Supabase 项目中执行 `supabase/` 目录下的 SQL 脚本：

```bash
supabase/optimized-schema.sql          # 核心表结构
supabase/create-verification-codes-table.sql
supabase/performance-indexes.sql
```

### 本地开发

```bash
npm run dev
# 或（macOS 下去除系统代理）：
./dev.sh
```

访问 [http://localhost:3000](http://localhost:3000)。

### 构建

```bash
npm run build
npm run start
```

## Docker 部署

构建镜像（通过 build-arg 传入公开环境变量）：

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
├── services/             # AI 服务商适配器、COS 存储、支付
└── types/                # 共享 TypeScript 类型
supabase/                 # SQL 迁移脚本
```

## 许可证

私有项目，保留所有权利。
