#!/bin/bash
# Doble clic para abrir el panel de Promolog. Levanta el servidor local y abre el
# navegador. Para cerrar: cerrá esta ventana de Terminal.
cd "$(dirname "$0")" || exit 1
[ -d node_modules ] || npm install

PORT="${UI_PORT:-4599}"

# Un panel viejo que quedó abierto se queda con el puerto y el nuevo muere al
# arrancar (EADDRINUSE) — la ventana aparece "en negro" con un stack trace. Peor:
# el panel viejo sigue sirviendo el código ANTERIOR, así que parece que los
# cambios no llegaron. Lo bajamos, pero SOLO si es nuestro (un `node ui.mjs`);
# si el puerto lo tiene otro programa, avisamos en vez de matarle el proceso.
for pid in $(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null); do
  if ps -p "$pid" -o command= | grep -q "ui\.mjs"; then
    echo "· Había un panel abierto de antes (PID $pid) — lo cierro para arrancar con la versión actual."
    kill "$pid" 2>/dev/null
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 || break
      sleep 0.3
    done
    lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && kill -9 "$pid" 2>/dev/null
  else
    echo "⚠️  El puerto $PORT lo está usando otro programa (PID $pid):"
    ps -p "$pid" -o command= | sed 's/^/     /'
    echo "     Cerralo, o abrí el panel en otro puerto:  UI_PORT=4600 open abrir-panel.command"
    echo
    echo "(Enter para cerrar esta ventana)"; read -r _; exit 1
  fi
done

( sleep 2; open "http://localhost:$PORT" ) &
exec node --env-file=.env ui.mjs
