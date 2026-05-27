# Maven Baileys Gateway -- imagen Docker.
#
# Single stage minimo: Node 20 alpine + npm install + run.
# La imagen pesa ~150MB con baileys + deps. Apenas mas grande que evolution-api.

FROM node:20-alpine

WORKDIR /app

# Tools: git no es estrictamente necesario pero baileys a veces pide build tools
# para qrcode (canvas). Si baileys ya viene precompilado, sobra.
RUN apk add --no-cache --virtual .build-deps python3 make g++ git \
    && true

# Instalar deps primero (cacheable layer).
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
    && apk del .build-deps \
    && rm -rf /root/.npm /tmp/*

# Copiar el server despues para no invalidar la cache de npm install.
COPY server.js ./

# El volumen de Docker se monta en /data; createamos el dir aca por si el
# usuario no monto volumen (auth se pierde en restarts, pero al menos arranca).
RUN mkdir -p /data/auth

ENV NODE_ENV=production \
    PORT=8080 \
    AUTH_DIR=/data/auth

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -q -O - http://localhost:8080/ || exit 1

CMD ["node", "server.js"]
