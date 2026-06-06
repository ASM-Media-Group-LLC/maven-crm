#!/usr/bin/env bash
set -uo pipefail

# 1) Display virtual para el agente headless
Xvfb :99 -screen 0 1920x1080x24 >/var/log/xvfb.log 2>&1 &
export DISPLAY=:99
sleep 2

# 2) Agente MLX. El binario es `mlx` (/usr/bin/mlx, confirmado en Slice 1; arranca el agente/launcher
#    que escucha en localhost:45001). [CONFIRMAR] el subcomando de login (token) y el de start de
#    profiles → se descubren con `mlx --help` una vez que el wrapper encuentra /opt/mlx/agent.bin.
( mlx >/var/log/mlx.log 2>&1 & ) || echo "[warn] no arrancó el agente mlx"
sleep 3
# TODO(slice1): autenticar con MLX_TOKEN cuando confirmemos el subcomando de login de `mlx`.

# 4) Microservicio
exec node server.js
