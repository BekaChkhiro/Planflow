FROM node:20-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Install build essentials for native modules (@lancedb/lancedb, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace config and install deps
COPY pnpm-workspace.yaml package.json turbo.json tsconfig.json ./
COPY pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/rag/package.json ./packages/rag/

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
COPY packages/rag ./packages/rag

RUN pnpm --filter=@planflow/shared build
RUN pnpm --filter=@planflow/rag build
RUN pnpm --filter=@planflow/api build

# Clean up dev deps and build tools for smaller image
RUN apt-get purge -y python3 make g++ && apt-get autoremove -y

ENV NODE_ENV=production
WORKDIR /app/apps/api

EXPOSE 3001
CMD ["node", "dist/index.js"]
