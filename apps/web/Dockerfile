# Built from the repo ROOT context (npm workspaces). On Railway set the service's
# build context to the repo root and dockerfilePath to apps/web/Dockerfile.
# npm install (not ci): Tailwind v4's oxide native/wasm optional deps (@emnapi/*)
# aren't fully captured cross-platform in the lockfile; install repairs them.
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
# @faira/db is built by the root postinstall (prisma generate needs a resolvable
# DATABASE_URL) even though the web app doesn't import it.
COPY packages/db ./packages/db
ENV DATABASE_URL="postgresql://user:password@localhost:5432/db"
RUN npm install --no-audit --no-fund

COPY apps/web ./apps/web
# NEXT_PUBLIC_* are baked into the client bundle at build time -- Railway
# passes service variables as build args/env automatically.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build -w faira-web

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/next.config.* ./apps/web/

EXPOSE 3000
CMD ["npm", "run", "start", "-w", "faira-web"]
