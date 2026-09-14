# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# TaskFlow 应用镜像
# 目标：本地与线上使用同一份镜像，避免「本地能跑线上挂」
# 说明：迁移由 entrypoint 执行（prisma migrate deploy），因此运行层需要保留 prisma CLI。
#      后续若要压缩镜像体积，可切换到 Next.js standalone 输出并把迁移拆成独立 job。
# ---------------------------------------------------------------------------

FROM node:22-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
# Prisma 在 Debian slim 上需要 openssl；curl 供 healthcheck 使用
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- 依赖层：只依赖 manifest，改动源码时该层仍命中缓存 ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---- 构建层 ----
FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- 运行层 ----
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs taskflow

COPY --chown=taskflow:nodejs --from=builder /app/node_modules ./node_modules
COPY --chown=taskflow:nodejs --from=builder /app/.next ./.next
COPY --chown=taskflow:nodejs --from=builder /app/public ./public
COPY --chown=taskflow:nodejs --from=builder /app/prisma ./prisma
COPY --chown=taskflow:nodejs --from=builder /app/package.json ./package.json
COPY --chown=taskflow:nodejs --from=builder /app/next.config.ts ./next.config.ts
COPY --chown=taskflow:nodejs --from=builder /app/postcss.config.mjs ./postcss.config.mjs
COPY --chown=taskflow:nodejs --from=builder /app/tsconfig.json ./tsconfig.json
COPY --chown=taskflow:nodejs docker/entrypoint.sh ./docker/entrypoint.sh

RUN chmod +x ./docker/entrypoint.sh

USER taskflow
EXPOSE 3000
ENTRYPOINT ["./docker/entrypoint.sh"]
CMD ["npm", "run", "start"]
