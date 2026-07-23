# Built from the repo ROOT context (npm workspaces). On Railway set the service's
# build context to the repo root and dockerfilePath to apps/api/Dockerfile.
FROM node:24-alpine AS builder
WORKDIR /app

# Workspace manifests + lockfile first (cached install layer). @faira/db source
# must be present before install because the root postinstall builds it
# (prisma generate + tsc). generate needs DATABASE_URL resolvable, not reachable.
COPY package.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/api-core/package.json ./packages/api-core/
COPY packages/ui/package.json ./packages/ui/
COPY apps/api/package.json ./apps/api/
COPY apps/collect-api/package.json ./apps/collect-api/
COPY apps/fulfilment-api/package.json ./apps/fulfilment-api/
COPY apps/web/package.json ./apps/web/
COPY apps/collect-web/package.json ./apps/collect-web/
COPY apps/fulfilment-web/package.json ./apps/fulfilment-web/
COPY packages/db ./packages/db
COPY packages/api-core ./packages/api-core
ENV DATABASE_URL="postgresql://user:password@localhost:5432/db"
RUN npm install --no-audit --no-fund

# Build the API workspace (tsc → apps/api/dist).
COPY apps/api ./apps/api
RUN npm run build -w faira-api

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

# node_modules holds the hoisted deps + a node_modules/@faira/db symlink into
# packages/db, so packages/db (dist + prisma) must be copied too. packages/db
# also carries the migrations for the `npm run migrate -w @faira/db` release step.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/db ./packages/db
COPY --from=builder /app/packages/api-core ./packages/api-core
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist

EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
