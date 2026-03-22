# CowTalk Server — Multi-stage production build

FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/

RUN npm ci --workspace=packages/shared --workspace=packages/server

COPY packages/shared/ ./packages/shared/
COPY packages/server/ ./packages/server/
COPY tsconfig.base.json ./

RUN npm run build:shared && npm run build:server

FROM node:22-alpine AS runner

WORKDIR /app

RUN addgroup -g 1001 -S cowtalk && adduser -S cowtalk -u 1001

COPY --from=builder --chown=cowtalk:cowtalk /app/package.json ./
COPY --from=builder --chown=cowtalk:cowtalk /app/packages/shared/package.json ./packages/shared/
COPY --from=builder --chown=cowtalk:cowtalk /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=cowtalk:cowtalk /app/packages/server/package.json ./packages/server/
COPY --from=builder --chown=cowtalk:cowtalk /app/packages/server/dist ./packages/server/dist
COPY --from=builder --chown=cowtalk:cowtalk /app/node_modules ./node_modules

USER cowtalk

ENV NODE_ENV=production
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q --spider http://localhost:4000/api/health || exit 1

CMD ["node", "packages/server/dist/index.js"]
