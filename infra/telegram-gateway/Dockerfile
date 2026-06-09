# telegram-gateway — Node + GramJS (MTProto). Lee canales de Telegram para Promolog.
# Mismo patron que el baileys-gateway: node:20-alpine, login por web (/manager),
# sesion persistida en el volumen /data. Sin Apify, sin scraping de HTML.
FROM node:20-alpine

WORKDIR /app

# Build tools por si alguna dep de GramJS pide compilar (se quitan despues).
RUN apk add --no-cache --virtual .build-deps python3 make g++ && true

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
    && apk del .build-deps \
    && rm -rf /root/.npm /tmp/*

COPY server.js manager.html ./

# Dir de la sesion (se monta un volumen Docker en /data; lo creamos por si no).
RUN mkdir -p /data

ENV NODE_ENV=production \
    PORT=8091 \
    AUTH_DIR=/data

EXPOSE 8091

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -q -O - http://localhost:8091/ || exit 1

CMD ["node", "server.js"]
