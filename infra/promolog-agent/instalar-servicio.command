#!/bin/bash
# Instala el agente de promolog como SERVICIO de macOS en esta máquina (Mac Mini).
# Doble clic para instalar. Vuelve a correrse sin problema para actualizar.
#
# QUÉ RESUELVE: el panel abierto a mano muere con el primer reinicio, cierre de
# sesión o crash — y deja de escanear EN SILENCIO. Como LaunchAgent, macOS lo
# levanta al iniciar sesión y lo vuelve a levantar si se cae (KeepAlive).
#
# POR QUÉ LaunchAgent y no LaunchDaemon: los scrapers usan Playwright con sesiones
# reales de navegador y a veces hace falta abrir una ventana para re-loguear. Eso
# necesita una sesión gráfica de usuario, que un daemon de sistema no tiene.
# ⚠️ Requisito en la Mac Mini: INICIO DE SESIÓN AUTOMÁTICO
#    (Ajustes → Usuarios y grupos → Inicio de sesión automático).
#    Sin eso, después de un reiniciar nadie inicia sesión y el agente no arranca.

set -u
cd "$(dirname "$0")" || exit 1
DIR="$(pwd)"
ETIQUETA="com.maven.promolog-agent"
PLIST="$HOME/Library/LaunchAgents/$ETIQUETA.plist"
LOGS="$DIR/logs"

pausar() { echo; echo "(Enter para cerrar esta ventana)"; read -r _; }

echo "▶︎ Instalando el agente de Promolog como servicio"
echo "· Carpeta: $DIR"

NODE="$(command -v node)"
if [ -z "$NODE" ]; then
  echo "⚠️  No encuentro Node.js. Instalalo con:  brew install node"; pausar; exit 1
fi
echo "· Node: $NODE ($(node -v))"

if [ ! -f .env ]; then
  echo "⚠️  Falta el .env con los tokens (PROMOLOG_EXT_TOKEN, CRON_INTERNAL_TOKEN)."
  echo "   Copiá el de la otra máquina antes de instalar el servicio."; pausar; exit 1
fi

# UI_HOST: por dónde se entra al panel. Sin esto el panel solo escucha en la
# propia máquina y no se puede abrir desde la laptop.
TS_IP="$(/usr/bin/tailscale ip -4 2>/dev/null | head -1 || true)"
[ -z "$TS_IP" ] && TS_IP="$(/Applications/Tailscale.app/Contents/MacOS/Tailscale ip -4 2>/dev/null | head -1 || true)"
if [ -n "$TS_IP" ]; then
  echo "· Tailscale detectado: $TS_IP → el panel va a escuchar ahí."
  HOST_BIND="$TS_IP"
else
  echo "· No detecté Tailscale. El panel va a escuchar SOLO en esta máquina (127.0.0.1)."
  echo "  Cuando instales Tailscale, volvé a correr este instalador."
  HOST_BIND="127.0.0.1"
fi

[ -d node_modules ] || { echo "· Instalando dependencias…"; npm install || { echo "⚠️  Falló npm install."; pausar; exit 1; }; }
mkdir -p "$LOGS" "$HOME/Library/LaunchAgents"

# Si ya estaba instalado, lo bajamos antes de reescribir el plist.
launchctl bootout "gui/$(id -u)/$ETIQUETA" 2>/dev/null

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ETIQUETA</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>--env-file=$DIR/.env</string>
    <string>$DIR/ui.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>UI_HOST</key><string>$HOST_BIND</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <!-- Se vuelve a levantar si se cae. Es la mitad del punto de esto. -->
  <key>KeepAlive</key><true/>
  <!-- Los logs son el único rastro cuando falla de noche y nadie mira. -->
  <key>StandardOutPath</key><string>$LOGS/agente.log</string>
  <key>StandardErrorPath</key><string>$LOGS/agente.error.log</string>
</dict>
</plist>
PLISTEOF

launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load "$PLIST" 2>/dev/null
sleep 2

if launchctl print "gui/$(id -u)/$ETIQUETA" >/dev/null 2>&1; then
  echo
  echo "✅ Servicio instalado y corriendo."
  echo "   Panel:   http://$HOST_BIND:4599"
  echo "   Logs:    $LOGS/agente.log"
  echo
  echo "   Arranca solo al iniciar sesión y se relevanta si se cae."
  echo "   Para detenerlo:  launchctl bootout gui/$(id -u)/$ETIQUETA"
else
  echo "⚠️  No pude confirmar que el servicio quedó corriendo."
  echo "   Mirá el log:  cat $LOGS/agente.error.log"
fi
pausar
