# CowTalk Web — Multi-stage production build

FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/web/package.json ./packages/web/
RUN npm ci --workspace=@cowtalk/shared --workspace=@cowtalk/web

# Build
FROM base AS builder
COPY package.json package-lock.json ./
COPY packages/shared/ ./packages/shared/
COPY packages/web/ ./packages/web/
COPY tsconfig.base.json ./
RUN npm ci
RUN npm run build --workspace=@cowtalk/shared --workspace=@cowtalk/web

# Serve static files with nginx
FROM nginx:1.27-alpine AS runner

COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -q --spider http://localhost:80 || exit 1
