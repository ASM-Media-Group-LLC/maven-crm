#!/bin/bash
# Doble clic para abrir el panel de Promolog. Levanta el servidor local y abre el
# navegador. Para cerrar: cerrá esta ventana de Terminal.
#
# ⚠️ REGLA DE ESTE ARCHIVO: NUNCA terminar sin decir por qué. El síntoma
# "se abre la Terminal en blanco y no pasa nada" ya se reportó dos veces, y las
# dos veces el problema real fue invisible porque el script moría sin imprimir.
# Por eso: traza desde la primera línea, y la ventana queda abierta ante
# CUALQUIER salida inesperada (trap EXIT) en vez de cerrarse y no dejar rastro.

echo "▶︎ Promolog — arrancando el panel…"

# Cualquier salida que no sea el arranque exitoso deja el motivo a la vista y
# espera un Enter. Sin esto, un error temprano cierra la ventana al instante.
salir_con_pausa() {
  local code=$?
  [ "$code" -eq 0 ] && return                       # arranque normal (exec)
  echo
  echo "⚠️  El panel no pudo arrancar (código $code)."
  echo "   Copiá lo de arriba y pasáselo a Claude."
  echo
  echo "(Enter para cerrar esta ventana)"; read -r _
}
trap salir_con_pausa EXIT

cd "$(dirname "$0")" || { echo "⚠️  No pude entrar a la carpeta del agente."; exit 1; }
echo "· Carpeta: $(pwd)"

# Node tiene que existir Y ser suficientemente nuevo: --env-file necesita 20+.
if ! command -v node >/dev/null 2>&1; then
  echo "⚠️  No encuentro Node.js. Instalalo con:  brew install node"
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
echo "· Node $(node -v)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "⚠️  Node $NODE_MAJOR es viejo: el panel necesita 20 o más (usa --env-file)."
  exit 1
fi

# El .env trae los tokens. Sin él, `node --env-file=.env` ABORTA antes de correr
# una sola línea — y esa era una de las formas de terminar con la ventana muda.
if [ ! -f .env ]; then
  echo "⚠️  Falta el archivo .env en $(pwd)."
  echo "   Tiene que tener PROMOLOG_EXT_TOKEN y CRON_INTERNAL_TOKEN."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "· Primera vez: instalando dependencias (tarda unos minutos)…"
  npm install || { echo "⚠️  Falló npm install."; exit 1; }
fi

PORT="${UI_PORT:-4599}"

# Un panel viejo que quedó abierto se queda con el puerto y el nuevo muere al
# arrancar (EADDRINUSE). Peor: el viejo sigue sirviendo el código ANTERIOR, así
# que parece que los cambios no llegaron — pasó exactamente eso el 01/08, con un
# panel de hace horas sirviendo una versión sin Facebook ni programación.
# Lo bajamos, pero SOLO si es nuestro (un `node ui.mjs`); si el puerto lo tiene
# otro programa, avisamos en vez de matarle el proceso.
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
    exit 1
  fi
done

echo "· Levantando en el puerto $PORT…"
( sleep 2; open "http://localhost:$PORT" ) &
# `exec` reemplaza este shell por node: a partir de acá manda el mensaje del panel.
# Si node falla al arrancar, su propio manejador de errores explica el motivo.
exec node --env-file=.env ui.mjs
