#!/bin/bash
# Doble clic para abrir el panel de Promolog. Levanta el servidor local y abre el
# navegador. Para cerrar: cerrá esta ventana de Terminal.
cd "$(dirname "$0")" || exit 1
[ -d node_modules ] || npm install
( sleep 2; open "http://localhost:${UI_PORT:-4599}" ) &
exec node --env-file=.env ui.mjs
