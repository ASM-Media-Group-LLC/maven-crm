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
RUN npm run build

# Stage 2: Serve the built bundle with nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
