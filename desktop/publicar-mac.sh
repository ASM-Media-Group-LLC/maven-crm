#!/bin/bash
# Arma la app de Mac en ESTE Mac (el de Alvaro), la firma con su Developer ID,
# la manda a Apple a notarizar y la publica como release `mac-v<versión>` de
# GitHub. El workflow app-escritorio-mac la copia al balde `descargas` y desde
# ahí la bajan la portada y el actualizador de la app.
#
# Necesita, en ~/.config/maven/firma-mac/ (nunca en el repo):
#   AuthKey_J4M84HWF78.p8  (llave de App Store Connect para notarizar)
#   issuer                 (el Issuer ID de esa llave)
# y el certificado «Developer ID Application: Alvaro Mejia» en el llavero.
set -euo pipefail
cd "$(dirname "$0")"
D="$HOME/.config/maven/firma-mac"
VERSION="2.1.$(date +%y%m%d%H%M)"
SALIDA="${TMPDIR:-/tmp}/maven-mac-$VERSION"

export APPLE_API_KEY="$D/AuthKey_J4M84HWF78.p8"
export APPLE_API_KEY_ID="J4M84HWF78"
APPLE_API_ISSUER="$(cat "$D/issuer")"; export APPLE_API_ISSUER
export CSC_NAME="Alvaro Mejia (BPV7M45Q6T)"
unset CSC_LINK MAVEN_IDENTIDAD

npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null
trap 'git checkout -q -- package.json package-lock.json 2>/dev/null || true' EXIT
# Fuera de iCloud/Documentos: los atributos de iCloud rompen codesign.
npx electron-builder --mac --publish never -c.directories.output="$SALIDA" -c.mac.forceCodeSigning=true

APP="$SALIDA/mac-universal/Maven.app"
codesign --verify --deep --strict "$APP"
spctl -a -t exec "$APP"
xcrun stapler validate "$APP"

cd "$SALIDA"
gh release create "mac-v$VERSION" Maven-Mac.dmg Maven-Mac.zip Maven-Mac.zip.blockmap latest-mac.yml \
  --repo ASM-Media-Group-LLC/maven-crm --title "Maven para Mac $VERSION" \
  --notes "Firmada con el Developer ID y notarizada por Apple. La publica en Descargas el workflow app-escritorio-mac."
echo "Listo: mac-v$VERSION"
