FROM node:20-slim AS base

# Cache-bust: force Railway to invalidate stale cache when this changes
ARG RAILWAY_CACHE_BUST=rag-integration-v1

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY turbo.json tsconfig.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/rag/package.json ./packages/rag/

RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
COPY packages/rag ./packages/rag

RUN pnpm --filter=@planflow/shared build
RUN pnpm --filter=@planflow/rag build
RUN pnpm --filter=@planflow/api build

FROM node:20-slim AS production

# Cache-bust: force Railway to invalidate stale cache when this changes
ARG RAILWAY_CACHE_BUST=rag-integration-v1

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

RUN mkdir -p apps/api packages/shared packages/rag

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/rag/package.json ./packages/rag/

RUN pnpm install --frozen-lockfile --prod

COPY --from=base /app/apps/api/dist ./apps/api/dist
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/rag/dist ./packages/rag/dist

ENV NODE_ENV=production
WORKDIR /app/apps/api
CMD node dist/index.js
