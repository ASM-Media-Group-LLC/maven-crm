FROM oven/bun:1.1-alpine

WORKDIR /app

# Instalamos deps primero — capa cacheable mientras package.json no cambia.
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

COPY tsconfig.json ./
COPY src ./src

# Healthcheck simple: el process queda vivo solo si el loop está corriendo.
# No exponemos HTTP — para health check externo, agregar un endpoint
# en src/index.ts si Dokploy lo requiere.

CMD ["bun", "run", "src/index.ts"]
