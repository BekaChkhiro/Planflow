FROM node:20-slim AS base

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Build stage
FROM base AS build

WORKDIR /app

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY turbo.json tsconfig.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy source files
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared

# Build arguments for Next.js (public env vars need to be available at build time)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_NAME=PlanFlow

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME

# Build
RUN pnpm --filter=@planflow/shared build
RUN pnpm --filter=@planflow/web build

# Production stage
FROM base AS production

WORKDIR /app

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY turbo.json tsconfig.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# Install production dependencies only
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

# Copy built files from build stage
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/next.config.js ./apps/web/next.config.js
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

WORKDIR /app/apps/web

CMD ["pnpm", "start"]
