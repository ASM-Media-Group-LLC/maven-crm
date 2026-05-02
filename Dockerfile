# syntax=docker/dockerfile:1

# Stage 1: Build the Vite app
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies first (better cache)
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

# Build-time env vars (Vite injects VITE_* into the bundle at build time)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_PUBLIC_URL
ARG SUPABASE_URL
ARG SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID
ENV VITE_PUBLIC_URL=$VITE_PUBLIC_URL
ENV SUPABASE_URL=$SUPABASE_URL
ENV SUPABASE_PUBLISHABLE_KEY=$SUPABASE_PUBLISHABLE_KEY

COPY . .

# The repo ships a .env that points at production. Delete it so it cannot
# leak into the build, then write a fresh .env.production from the build
# args. .env.production is higher priority than .env in Vite, but we also
# remove .env entirely as a belt-and-suspenders measure.
RUN rm -f .env .env.local .env.production .env.production.local

RUN printf "VITE_SUPABASE_URL=%s\nVITE_SUPABASE_PUBLISHABLE_KEY=%s\nVITE_SUPABASE_PROJECT_ID=%s\nVITE_PUBLIC_URL=%s\nSUPABASE_URL=%s\nSUPABASE_PUBLISHABLE_KEY=%s\n" \
    "$VITE_SUPABASE_URL" \
    "$VITE_SUPABASE_PUBLISHABLE_KEY" \
    "$VITE_SUPABASE_PROJECT_ID" \
    "$VITE_PUBLIC_URL" \
    "$SUPABASE_URL" \
    "$SUPABASE_PUBLISHABLE_KEY" \
    > .env.production

# Visible in build logs so we can confirm the right values are flowing
# through the build args (key is truncated to avoid leaking it).
RUN echo "=== build env (truncated) ===" && \
    echo "VITE_SUPABASE_URL='$VITE_SUPABASE_URL'" && \
    echo "VITE_SUPABASE_PROJECT_ID='$VITE_SUPABASE_PROJECT_ID'" && \
    echo "VITE_PUBLIC_URL='$VITE_PUBLIC_URL'" && \
    echo "VITE_SUPABASE_PUBLISHABLE_KEY (first 20 chars)='$(echo "$VITE_SUPABASE_PUBLISHABLE_KEY" | head -c 20)…'" && \
    echo "=== .env.production written: ===" && \
    cat .env.production | sed 's/\(KEY=[^=]\{20\}\).*/\1…(truncated)/' && \
    echo "============================="

RUN npm run build

# Stage 2: Serve the built bundle with nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
