# cloudphone-gateway — Slice 1 (de-risk)
# Corre el AGENTE Multilogin X headless (Xvfb) + un microservicio Node que prueba la
# cadena real: arrancar un cloud phone (launcher local :45001) -> adb connect + glogin
# -> capturar 1 frame. Base Ubuntu porque el agente MLX soporta oficialmente Ubuntu.
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

# Base + Xvfb (display virtual para el agente headless) + adb (control del device)
# + libs gráficas que suele requerir el agente. [CONFIRMAR el set exacto en el 1er build]
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg dpkg \
      xvfb x11-utils \
      adb \
      libnss3 libgbm1 libasound2 libxss1 libxtst6 libatk1.0-0 libatk-bridge2.0-0 libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

# Node 20 (microservicio)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# --- Agente Multilogin X (headless) ---
# Slice 1 confirmó: el .deb trae UN solo binario `mlx` (wrapper en /usr/bin/mlx que ejecuta
# /opt/mlx/agent.bin). HAY QUE EXTRAER A LA RAÍZ "/" para que el wrapper encuentre /opt/mlx/agent.bin
# (extraer a /opt/mlx lo dejaba en /opt/mlx/opt/mlx/agent.bin → el wrapper tiraba "agent.bin: not found").
RUN curl -L -f -o /tmp/mlxdeb.deb "https://mlxdists.s3.eu-west-3.amazonaws.com/mlx/latest/multiloginx-amd64.deb" \
    && dpkg-deb -x /tmp/mlxdeb.deb / \
    && rm /tmp/mlxdeb.deb
# /usr/bin/mlx ya queda en el PATH por defecto.

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js entrypoint.sh ./
RUN chmod +x entrypoint.sh

ENV DISPLAY=:99
ENV PORT=8090
EXPOSE 8090
ENTRYPOINT ["./entrypoint.sh"]
