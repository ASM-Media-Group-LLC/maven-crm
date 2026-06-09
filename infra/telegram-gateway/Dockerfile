# telegram-gateway — Node + GramJS (MTProto). Lee canales de Telegram para Promolog.
# Sin Apify, sin scraping de HTML: API oficial de Telegram con una cuenta logueada
# (session string como secreto). Patrón igual al cloudphone-gateway (Node puro).
FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js login.js ./
ENV PORT=8091
EXPOSE 8091
CMD ["node", "server.js"]
