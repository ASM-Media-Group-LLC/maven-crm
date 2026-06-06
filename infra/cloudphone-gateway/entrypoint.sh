#!/usr/bin/env bash
set -uo pipefail

# 1) Display virtual para el agente headless
Xvfb :99 -screen 0 1920x1080x24 >/var/log/xvfb.log 2>&1 &
export DISPLAY=:99
sleep 2

# 2) Login del agente (xcli). El token queda cacheado ~24h en ~/.config/xcli.
#    Preferimos TOKEN (menos sensible que la password de la cuenta).
#    [CONFIRMAR] los flags exactos de `xcli login` (token vs email/password, 2FA).
if [ -n "${MLX_TOKEN:-}" ]; then
  xcli login --token "$MLX_TOKEN" || echo "[warn] 'xcli login --token' falló (CONFIRMAR flag real)"
elif [ -n "${MLX_EMAIL:-}" ] && [ -n "${MLX_PASSWORD:-}" ]; then
  xcli login --email "$MLX_EMAIL" --password "$MLX_PASSWORD" \
    || echo "[warn] 'xcli login' email/pass falló (CONFIRMAR flags / 2FA)"
else
  echo "[warn] sin credenciales MLX (MLX_TOKEN o MLX_EMAIL/MLX_PASSWORD) — el agente no autenticará"
fi

# 3) Launcher/agente MLX → escucha en localhost:45001  [CONFIRMAR nombre del binario]
( mlx-launcher >/var/log/mlx.log 2>&1 & ) || echo "[warn] no arrancó mlx-launcher (CONFIRMAR binario/flags)"
sleep 3

# 4) Microservicio
exec node server.js
