# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build the Vite app with PLACEHOLDER values for env-driven config.
# The real values are injected at container startup by docker-entrypoint.sh,
# so the same image works for staging and prod (different env vars, same bin).
# This pattern sidesteps the Dokploy limitation that Environment vars are
# only available at runtime, not as docker build --build-arg.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

COPY . .

# Wipe any .env shipped in the repo so it can't pollute the build.
RUN rm -f .env .env.local .env.production .env.production.local

# Bake placeholders that the runtime entrypoint will replace via sed.
ENV VITE_SUPABASE_URL=__RUNTIME_VITE_SUPABASE_URL__
ENV VITE_SUPABASE_PUBLISHABLE_KEY=__RUNTIME_VITE_SUPABASE_PUBLISHABLE_KEY__
ENV VITE_SUPABASE_PROJECT_ID=__RUNTIME_VITE_SUPABASE_PROJECT_ID__
ENV VITE_PUBLIC_URL=__RUNTIME_VITE_PUBLIC_URL__

RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: serve with nginx, substituting placeholders at startup.
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.d/40-runtime-env.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-env.sh

# nginx:alpine already has /docker-entrypoint.sh that runs every executable
# in /docker-entrypoint.d/ before starting nginx. Dropping our script there
# is the idiomatic way to hook into that lifecycle.
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
