# Imagen oficial de Playwright: ya trae Chromium + todas las libs del sistema.
FROM mcr.microsoft.com/playwright:v1.47.0-jammy
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.mjs"]
