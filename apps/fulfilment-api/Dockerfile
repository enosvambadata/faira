# Built from the repo ROOT context (npm workspaces). On Railway set the service's
# build context to the repo root and dockerfilePath to apps/fulfilment-api/Dockerfile.
FROM node:24-alpine AS builder
WORKDIR /app

# All workspace manifests + shared package sources (the root postinstall builds
# @faira/db + @faira/api-core; prisma generate needs a resolvable DATABASE_URL).
COPY package.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/api-core/package.json ./packages/api-core/
COPY packages/ui/package.json ./packages/ui/
COPY apps/api/package.json ./apps/api/
COPY apps/collect-api/package.json ./apps/collect-api/
COPY apps/fulfilment-api/package.json ./apps/fulfilment-api/
COPY apps/web/package.json ./apps/web/
COPY packages/db ./packages/db
COPY packages/api-core ./packages/api-core
ENV DATABASE_URL="postgresql://user:password@localhost:5432/db"
RUN npm install --no-audit --no-fund

COPY apps/fulfilment-api ./apps/fulfilment-api
RUN npm run build -w fulfilment-api

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/db ./packages/db
COPY --from=builder /app/packages/api-core ./packages/api-core
COPY --from=builder /app/apps/fulfilment-api/package.json ./apps/fulfilment-api/package.json
COPY --from=builder /app/apps/fulfilment-api/dist ./apps/fulfilment-api/dist

EXPOSE 3000
CMD ["node", "apps/fulfilment-api/dist/server.js"]
