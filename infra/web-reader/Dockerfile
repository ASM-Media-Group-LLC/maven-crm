# Imagen oficial de Playwright: ya trae Chromium + todas las libs del sistema.
# ⚠️ LA VERSIÓN DE LA IMAGEN Y LA DEL PAQUETE TIENEN QUE SER LA MISMA (EXACTA).
# Cada release de Playwright espera un build de Chromium con su propio número de
# revisión, y la imagen solo trae el suyo. Con "^1.47.0" npm instalaba una versión
# más nueva y el micro arrancaba bien pero moría al primer /read:
#   browserType.launch: Executable doesn't exist at
#   /ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/...
# Si se sube la imagen, subir el pin de package.json en el mismo commit.
FROM mcr.microsoft.com/playwright:v1.47.0-jammy
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.mjs"]
