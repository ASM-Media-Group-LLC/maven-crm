# cloudphone-gateway — Node service que envuelve la CLOUD API de Multilogin.
# Los cloud phones (= GeeLark por debajo) se manejan 100% por api.multilogin.com y se embeben
# por la URL web (iframe) → NO hace falta el agente MLX, ni Xvfb, ni ADB.
#
# IMPORTANTE: el agente MLX, además de innecesario, HIJACKEABA `api.multilogin.com` (lo resolvía a
# un http.server local que respondía 501 "Unsupported method POST" a los POST) → rompía el micro.
# Por eso esta imagen es Node puro, sin agente.
FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
ENV PORT=8090
EXPOSE 8090
CMD ["node", "server.js"]
