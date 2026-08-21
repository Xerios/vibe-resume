# Builds the static bundle, then serves it with nginx — the app is fully
# client-side (see src/routes/+layout.js), so nothing but static files ships.

FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@11 --activate
WORKDIR /app

# Separate layer so dependency install is cached across source-only changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM nginx:alpine AS run
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80
