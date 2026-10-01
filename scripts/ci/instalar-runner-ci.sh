#!/bin/bash
# Instala en esta Mac (mini5) el «runner» de GitHub Actions para el CI de Maven:
# GitHub le manda aquí las revisiones de cada PR en vez de usar (y cobrar) sus
# máquinas. El despliegue de las edge functions sigue en las máquinas de GitHub.
#
# Uso:  sudo bash /Users/Shared/instalar-runner-ci.sh            instalar
#       sudo bash /Users/Shared/instalar-runner-ci.sh --quitar   desinstalar
#
# Qué hace, en orden (se detiene en el primer error):
#   1. Crea el usuario «maven-ci»: oculto, sin contraseña conocida, sin admin.
#   2. Cierra la carpeta de asm002 (700) para que ningún otro usuario la lea.
#   3. Prueba de aislamiento: corre como lo va a correr el servicio y comprueba
#      que maven-ci NO puede leer ni escribir los discos del NAS ni la carpeta de
#      asm002. Si puede, se detiene sin registrar nada.
#   4. Baja el runner de github.com/actions/runner y verifica su SHA-256.
#   5. Pide la clave de un solo uso de GitHub y registra la Mac como «mini5».
#   6. Lo deja como servicio del sistema (arranca solo, prioridad baja).
set -euo pipefail

USUARIO=maven-ci
CASA=/Users/$USUARIO
DIR=$CASA/actions-runner
ETIQUETA=ai.maven.ci-runner
PLIST=/Library/LaunchDaemons/$ETIQUETA.plist
REPO_URL=https://github.com/jhonjlopez-sudo/maven-crm
DUENO=asm002
DISCOS="/Volumes/NAS1 /Volumes/NAS2"

if [ "$(id -u)" -ne 0 ]; then
  echo "Córrelo con sudo: sudo bash $0"
  exit 1
fi

if [ "${1:-}" = "--quitar" ]; then
  launchctl bootout system "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  if id "$USUARIO" >/dev/null 2>&1; then
    sysadminctl -deleteUser "$USUARIO" 2>&1 | tail -1 || true
  fi
  echo "Listo: se quitó el servicio y el usuario $USUARIO."
  echo "Falta borrar el runner «mini5» en GitHub → Settings → Actions → Runners."
  exit 0
fi

for d in $DISCOS; do
  if [ ! -d "$d" ]; then
    echo "$d no está montado: sin él la prueba de aislamiento no dice nada. Móntalo y vuelve a correr esto."
    exit 1
  fi
done

echo
echo "== 1/6 Usuario aparte para el CI ($USUARIO)"
if id "$USUARIO" >/dev/null 2>&1; then
  echo "Ya existe."
else
  # Contraseña al azar que nadie conoce: nadie inicia sesión con este usuario.
  sysadminctl -addUser "$USUARIO" -fullName "Maven CI" -password "$(openssl rand -base64 32)" -home "$CASA" 2>&1 | grep -Eiv "secure ?token" || true
fi
id "$USUARIO" >/dev/null 2>&1 || { echo "No se pudo crear $USUARIO."; exit 1; }
dscl . create "/Users/$USUARIO" IsHidden 1
if [ ! -d "$CASA" ]; then
  mkdir -p "$CASA"
fi
chown "$USUARIO":staff "$CASA"
chmod 700 "$CASA"
echo "OK: $(id "$USUARIO")"

echo
echo "== 2/6 Que ese usuario no pueda ver la carpeta de $DUENO"
chmod 700 "/Users/$DUENO"
ls -ld "/Users/$DUENO"

echo
echo "== 3/6 Prueba de aislamiento (como lo va a correr el servicio)"
PRUEBA_SH=/Users/Shared/.ci-prueba-aislamiento.sh
PRUEBA_OUT=/Users/Shared/.ci-prueba-aislamiento.txt
PRUEBA_PLIST=/Library/LaunchDaemons/ai.maven.ci-prueba.plist
cat > "$PRUEBA_SH" <<EOF
#!/bin/sh
for d in $DISCOS /Users/$DUENO /Users/$DUENO/maven-nas-drive; do
  if ls "\$d" >/dev/null 2>&1; then echo "PUEDE_LEER \$d"; else echo "no_lee \$d"; fi
done
if cat /Users/$DUENO/maven-nas-drive/.env >/dev/null 2>&1; then echo "PUEDE_LEER .env"; else echo "no_lee .env"; fi
for d in $DISCOS; do
  if touch "\$d/.ci-prueba" 2>/dev/null; then echo "PUEDE_ESCRIBIR \$d"; rm -f "\$d/.ci-prueba"; else echo "no_escribe \$d"; fi
done
echo FIN
EOF
chmod 755 "$PRUEBA_SH"
rm -f "$PRUEBA_OUT"
cat > "$PRUEBA_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>ai.maven.ci-prueba</string>
  <key>UserName</key><string>$USUARIO</string>
  <key>ProgramArguments</key><array><string>/bin/sh</string><string>$PRUEBA_SH</string></array>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$PRUEBA_OUT</string>
  <key>StandardErrorPath</key><string>/dev/null</string>
</dict></plist>
EOF
launchctl bootout system "$PRUEBA_PLIST" 2>/dev/null || true
launchctl bootstrap system "$PRUEBA_PLIST"
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if grep -q FIN "$PRUEBA_OUT" 2>/dev/null; then break; fi
  sleep 1
done
launchctl bootout system "$PRUEBA_PLIST" 2>/dev/null || true
rm -f "$PRUEBA_PLIST" "$PRUEBA_SH"
cat "$PRUEBA_OUT" 2>/dev/null || true
if ! grep -q FIN "$PRUEBA_OUT" 2>/dev/null; then
  rm -f "$PRUEBA_OUT"
  echo "La prueba no terminó: no sigo. Pásale este resultado a Claude."
  exit 1
fi
if grep -q "^PUEDE" "$PRUEBA_OUT"; then
  rm -f "$PRUEBA_OUT"
  echo "ALTO: $USUARIO puede tocar algo que no debe (líneas PUEDE_… arriba). No registré nada. Pásale este resultado a Claude."
  exit 1
fi
rm -f "$PRUEBA_OUT"
echo "OK: $USUARIO no lee ni escribe los discos del NAS ni la carpeta de $DUENO."

if [ -f "$DIR/.runner" ]; then
  echo
  echo "== 4-5/6 El runner ya estaba registrado: no lo bajo ni lo registro otra vez."
else
  echo
  echo "== 4/6 Programa del runner (github.com/actions/runner), con su huella SHA-256"
  REL=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest)
  VER=$(printf '%s' "$REL" | grep -m1 '"tag_name"' | sed -E 's/.*"v?([0-9][0-9.]*)".*/\1/')
  SHA=$(printf '%s' "$REL" | grep -o 'BEGIN SHA osx-arm64 -->[0-9a-f]\{64\}' | grep -o '[0-9a-f]\{64\}$' | head -1)
  if [ -z "$VER" ] || [ -z "$SHA" ]; then
    echo "No encontré la versión o la huella de la última release."
    exit 1
  fi
  TGZ=actions-runner-osx-arm64-$VER.tar.gz
  mkdir -p "$DIR"
  cd "$DIR"
  curl -fsSL -o "$TGZ" "https://github.com/actions/runner/releases/download/v$VER/$TGZ"
  echo "$SHA  $TGZ" | shasum -a 256 -c -
  tar xzf "$TGZ"
  rm -f "$TGZ"
  chown -R "$USUARIO":staff "$CASA"
  echo "OK: runner $VER"

  echo
  echo "== 5/6 Registro en GitHub"
  echo "En GitHub: repo maven-crm → Settings → Actions → Runners → New self-hosted runner → macOS."
  echo "Copia SOLO la clave que aparece después de «--token» (vale una hora)."
  printf "Pégala aquí y pulsa Enter (no se ve al pegar): "
  read -r -s CLAVE
  echo
  if [ -z "$CLAVE" ]; then
    echo "Sin clave no se puede registrar. Vuelve a correr esto cuando la tengas."
    exit 1
  fi
  sudo -u "$USUARIO" -H env RUNNER_TOKEN="$CLAVE" /bin/bash -c \
    "cd '$DIR' && ./config.sh --unattended --replace --url '$REPO_URL' --token \"\$RUNNER_TOKEN\" --name mini5 --labels mini5 --work _work"
  unset CLAVE
fi

echo
echo "== 6/6 Servicio que arranca solo con la Mac (prioridad baja para no frenar al NAS)"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$ETIQUETA</string>
  <key>UserName</key><string>$USUARIO</string>
  <key>ProgramArguments</key><array><string>$DIR/run.sh</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>Nice</key><integer>10</integer>
  <key>LowPriorityIO</key><true/>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key><string>$CASA</string>
    <key>LANG</key><string>en_US.UTF-8</string>
  </dict>
  <key>StandardOutPath</key><string>$CASA/runner.log</string>
  <key>StandardErrorPath</key><string>$CASA/runner.log</string>
</dict></plist>
EOF
chown root:wheel "$PLIST"
chmod 644 "$PLIST"
launchctl bootout system "$PLIST" 2>/dev/null || true
launchctl bootstrap system "$PLIST"
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
  if grep -q "Listening for Jobs" "$CASA/runner.log" 2>/dev/null; then break; fi
  sleep 1
done
if grep -q "Listening for Jobs" "$CASA/runner.log" 2>/dev/null; then
  echo "LISTO: mini5 está conectado a GitHub y esperando trabajos."
else
  echo "El servicio arrancó pero todavía no dice «Listening for Jobs». Últimas líneas:"
  tail -5 "$CASA/runner.log" 2>/dev/null || true
fi
