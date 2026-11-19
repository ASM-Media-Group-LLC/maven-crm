#!/usr/bin/env bash
# Candado común del tren de agencias: NADA de esto corre contra la base de Kash.
#
#   source infra/casas/guarda-kash.sh
#   no_es_kash "$REF"          # sale con error si REF es Kash (o viene vacío)
#   solo_edificio "$REF"       # además exige que sea exactamente el edificio
#
# Kash (lsagslbkliprespbyhts) es la cuenta principal y no se toca bajo ninguna
# situación (decisión de Alvaro, 19/11/2026): ni migraciones, ni secretos, ni
# funciones, ni datos.

KASH_REF="lsagslbkliprespbyhts"
EDIFICIO_REF="ezeigddgkaemxpshghmu"
KASH_TENANT="30869615-f579-4981-8a1f-dbebc61eae2d"

no_es_kash() {
  local ref="${1:-}"
  if [ -z "$ref" ]; then echo "ALTO: no se sabe a qué base apunta (ref vacío)." >&2; exit 1; fi
  if [ "$ref" = "$KASH_REF" ]; then echo "ALTO: esa es la base de Kash ($KASH_REF). Kash no se toca." >&2; exit 1; fi
  case "$ref" in *"$KASH_REF"*) echo "ALTO: la dirección contiene la base de Kash." >&2; exit 1;; esac
}

solo_edificio() {
  no_es_kash "${1:-}"
  if [ "$1" != "$EDIFICIO_REF" ]; then
    echo "ALTO: esto solo corre contra el edificio ($EDIFICIO_REF), no contra «$1»." >&2; exit 1
  fi
}
