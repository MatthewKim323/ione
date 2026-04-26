# syntax=docker/dockerfile:1.6
#
# Multi-stage build for the ione API on Fly.io.
# Stage 1 — install + compile TypeScript with full devDeps.
# Stage 2 — slim runtime with only the production node_modules.
#
# We pin Node 20-alpine for a small image (≈ 120MB final) and because Hono +
# better-auth + sharp all support it cleanly. sharp ships pre-built musl
# binaries so we don't need to compile libvips at install time.
#
# Build (from repo root):
#   docker build -f api/Dockerfile -t ione-api:dev .
# Run:
#   docker run --rm -p 8787:8787 --env-file .env.local ione-api:dev

ARG NODE_VERSION=20

# ─── deps ─────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /workspace/api

# libc6-compat: sharp's musl prebuilt binary needs glibc-compat
# python3/make/g++: only needed if a transitive dep falls back to source
RUN apk add --no-cache libc6-compat

COPY api/package.json api/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --include=dev; \
    else npm install --include=dev; fi

# ─── build ────────────────────────────────────────────────────────────────────
FROM deps AS build
WORKDIR /workspace/api
COPY api/tsconfig.json api/tsconfig.build.json ./
COPY api/src ./src
RUN ./node_modules/.bin/tsc -p tsconfig.build.json
RUN npm prune --omit=dev

# ─── runtime ──────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runtime
WORKDIR /app

# alpine + sharp musl prebuild needs libc6-compat at runtime too
RUN apk add --no-cache libc6-compat tini \
    && addgroup -S app && adduser -S -G app app

ENV NODE_ENV=production \
    PORT=8787

COPY --from=build --chown=app:app /workspace/api/package.json ./package.json
COPY --from=build --chown=app:app /workspace/api/node_modules ./node_modules
COPY --from=build --chown=app:app /workspace/api/dist ./dist

USER app
EXPOSE 8787

# tini reaps any orphaned children sharp might spawn
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/server.js"]
