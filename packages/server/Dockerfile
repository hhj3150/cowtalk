FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/

RUN npm ci --workspace=packages/shared --workspace=packages/server

COPY packages/shared/ ./packages/shared/
COPY packages/server/ ./packages/server/

RUN npm run build:shared && npm run build:server

FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/package.json ./packages/server/
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/server/node_modules ./packages/server/node_modules

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "packages/server/dist/index.js"]
