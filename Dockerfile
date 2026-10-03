# Builds the static bundle, then serves it with nginx — the app is fully
# client-side (see apps/web/src/routes/+layout.ts), so nothing but static files ships.

FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@11 --activate
WORKDIR /app

# Separate layer so dependency install is cached across source-only changes.
# Every workspace package's manifest has to be here before the install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY apps/web/package.json ./apps/web/
COPY packages/core/package.json ./packages/core/
COPY packages/format-yaml/package.json ./packages/format-yaml/
COPY packages/format-markdown/package.json ./packages/format-markdown/
COPY packages/render/package.json ./packages/render/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM nginx:alpine AS run
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/build /usr/share/nginx/html

EXPOSE 80
