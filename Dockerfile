# Stage 1: Install dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install bun
RUN npm install -g bun

COPY package.json bun.lock* ./
COPY scripts/ ./scripts/
RUN bun install --frozen-lockfile

# Stage 2: Build
FROM node:20-alpine AS builder
RUN npm install -g bun
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time public env vars (hardcoded into bundle)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_GEMINI_API_KEY
ARG NEXT_PUBLIC_OPENAI_API_KEY
ARG NEXT_PUBLIC_OPENAI_BASE_URL
ARG NEXT_PUBLIC_USE_GATEWAY_PROXY
ARG NEXT_PUBLIC_GATEWAY_PROXY_BASE
ARG NEXT_PUBLIC_ASSIGNED_KEY_TTL_MS
ARG NEXT_PUBLIC_ENABLE_MASTER_CODE

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_GEMINI_API_KEY=$NEXT_PUBLIC_GEMINI_API_KEY
ENV NEXT_PUBLIC_OPENAI_API_KEY=$NEXT_PUBLIC_OPENAI_API_KEY
ENV NEXT_PUBLIC_OPENAI_BASE_URL=$NEXT_PUBLIC_OPENAI_BASE_URL
ENV NEXT_PUBLIC_USE_GATEWAY_PROXY=$NEXT_PUBLIC_USE_GATEWAY_PROXY
ENV NEXT_PUBLIC_GATEWAY_PROXY_BASE=$NEXT_PUBLIC_GATEWAY_PROXY_BASE
ENV NEXT_PUBLIC_ASSIGNED_KEY_TTL_MS=$NEXT_PUBLIC_ASSIGNED_KEY_TTL_MS
ENV NEXT_PUBLIC_ENABLE_MASTER_CODE=$NEXT_PUBLIC_ENABLE_MASTER_CODE

ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# standalone 输出
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
