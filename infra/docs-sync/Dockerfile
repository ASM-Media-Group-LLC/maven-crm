# Node a secas: este micro es websockets y fusiones de Yjs, no necesita nada del
# sistema. Es barato en CPU a propósito — comparte máquina con whisper, que ya
# se lleva 4 de los 8 núcleos transcribiendo audios del bot.
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.mjs"]
