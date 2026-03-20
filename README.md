# ZeoCanvas Lite

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
