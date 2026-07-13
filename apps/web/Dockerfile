# npm install (not ci) is deliberate: the lockfile is generated on the
# Windows dev machine and npm's cross-platform optional-dependency gap
# (@emnapi/*, platform-native lightningcss/sharp binaries) makes npm ci
# fail on linux with that lockfile. install still resolves from the
# lockfile where consistent, and repairs the optional-dep entries.
FROM node:24-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY . .
# NEXT_PUBLIC_* are baked into the client bundle at build time -- Railway
# passes service variables as build args/env automatically.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.* ./

EXPOSE 3000
CMD ["npx", "next", "start"]
