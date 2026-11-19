#!/usr/bin/env bash
# Pone AL DÍA la base del edificio (tren de agencias, vagón 1 — 19/11/2026).
#
#   infra/casas/al-dia.sh <id-de-la-casa> <carpeta-de-salida> [versiones-ya-aplicadas.txt]
#
# El molde (infra/casas/molde/esquema.sql) se sacó de Kash el 16/11/2026 02:16 UTC.
# Todo lo que Kash recibió después vive en supabase/migrations con una versión
# mayor que CORTE. Este paso:
#   1. toma esas migraciones (y las propias del edificio, infra/casas/edificio-migraciones/);
#   2. si hay un reemplazo saneado en infra/casas/al-dia/reemplazos/<archivo>, usa ese;
#   3. cambia lo propio de Kash: su dirección → la de la casa; el código de la agencia
#      Kash → el uuid nulo (así los «solo si es Kash» no hacen nada); cualquier otro uuid
#      escrito a mano (personas de Kash) → el uuid nulo; el sistema externo y los
#      dominios de Kash → direcciones .invalid;
#   4. renumera las versiones repetidas (el CLI exige versiones únicas);
#   5. deja archivos vacíos con las versiones que la casa ya tiene aplicadas, para
#      que `supabase db push` no se queje de historia que no conoce;
#   6. borra al final las tablas de respaldo que esas migraciones crean en Kash.
# Se niega a preparar nada para Kash y termina con error si algo de Kash se cuela.
set -euo pipefail

CASA_ID="${1:?falta el id de la casa (ver infra/casas/casas.json)}"
SALIDA="${2:?falta la carpeta de salida}"
YA_APLICADAS="${3:-}"
RAIZ="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$RAIZ/../.." && pwd)"
# shellcheck source=guarda-kash.sh
source "$RAIZ/guarda-kash.sh"

CORTE="20261116021651"   # hora (UTC) en que se sacó el molde de Kash
NULO="00000000-0000-0000-0000-000000000000"

leer() { jq -r --arg id "$CASA_ID" ".casas[] | select(.id == \$id) | .$1" "$RAIZ/casas.json"; }
REF="$(leer ref)"
TENANT="$(leer tenant_id)"
if [ -z "$REF" ] || [ "$REF" = "null" ]; then echo "La casa «$CASA_ID» no está en casas.json" >&2; exit 1; fi
no_es_kash "$REF"
[ "$TENANT" != "$KASH_TENANT" ] || { echo "ALTO: la casa no puede usar el código de la agencia Kash." >&2; exit 1; }

mkdir -p "$SALIDA"
USADAS=" "   # versiones ya tomadas (portable: sin arreglos asociativos)
REPORTE="$SALIDA/../al-dia-reporte.txt"
: > "$REPORTE"

version_libre() {
  local v="$1"
  while case "$USADAS" in *" $v "*) true;; *) false;; esac; do v=$((v + 1)); done
  echo "$v"
}

sanear() {
  # stdin → stdout
  sed -E \
    -e "s/${KASH_REF}/${REF}/g" \
    -e "s/${KASH_TENANT}/${NULO}/g" \
    -e "s#https://hmsyrnxbgaaqwnorpkxj\.supabase\.co#https://sincronizacion-externa-de-kash.invalid#g" \
    -e "s#([a-z0-9-]+\.)?kashagency\.me#kash-no-aplica.invalid#g" \
    -e 's#Basic [A-Za-z0-9+/=]{12,}#Basic SIN-CREDENCIAL#g' \
  | perl -pe "s/'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'/(\$1 eq '${NULO}' || \$1 eq '${TENANT}') ? \"'\$1'\" : \"'${NULO}'\"/ge"
}

# Las versiones que la casa ya tiene: archivos vacíos (no se vuelven a correr).
if [ -n "$YA_APLICADAS" ] && [ -f "$YA_APLICADAS" ]; then
  while read -r v; do
    [ -n "$v" ] || continue
    USADAS="$USADAS$v "
    : > "$SALIDA/${v}_ya_aplicada.sql"
  done < "$YA_APLICADAS"
fi

RESPALDOS=""
n=0
for f in "$REPO"/supabase/migrations/*.sql "$RAIZ"/edificio-migraciones/*.sql; do
  [ -f "$f" ] || continue
  base="$(basename "$f")"
  v="${base%%_*}"
  [[ "$v" =~ ^[0-9]{14}$ ]] || continue
  [ "$v" \> "$CORTE" ] || continue
  origen="$f"
  if [ -f "$RAIZ/al-dia/reemplazos/$base" ]; then origen="$RAIZ/al-dia/reemplazos/$base"; fi
  nueva="$(version_libre "$v")"; USADAS="$USADAS$nueva "
  destino="$SALIDA/${nueva}_${base#*_}"
  sanear < "$origen" > "$destino"
  cambios="$(diff <(cat "$origen") "$destino" | grep -c '^>' || true)"
  echo "$nueva  ${base}$( [ "$origen" != "$f" ] && echo '  [reemplazo saneado]')$( [ "$nueva" != "$v" ] && echo "  [renumerada desde $v]")  líneas cambiadas: $cambios" >> "$REPORTE"
  RESPALDOS="$RESPALDOS $(grep -oiE 'create table if not exists public\.[a-z0-9_]*(respaldo|backup)[a-z0-9_]*' "$destino" | awk '{print $NF}' | tr '\n' ' ' || true)"
  n=$((n + 1))
done

# Limpieza final: sin tablas de respaldo de Kash en el edificio.
fin="$(version_libre 20261119235900)"; USADAS="$USADAS$fin "
{
  echo "-- Sin tablas de respaldo de Kash en el edificio (generado por al-dia.sh)."
  for t in $RESPALDOS; do echo "drop table if exists $t cascade;"; done
} > "$SALIDA/${fin}_edificio_sin_respaldos.sql"

# Comprobación: nada de Kash puede quedar.
if grep -l -e "$KASH_REF" -e "$KASH_TENANT" "$SALIDA"/*.sql >/dev/null 2>&1; then
  echo "ALTO: quedó algo apuntando a Kash:" >&2
  grep -n -e "$KASH_REF" -e "$KASH_TENANT" "$SALIDA"/*.sql | head >&2
  exit 1
fi
if grep -q -E "eyJ[A-Za-z0-9_-]{20,}\.|Basic [A-Za-z0-9+/=]{12,}|hmsyrnxbgaaqwnorpkxj|kashagency\.me" "$SALIDA"/*.sql; then
  echo "ALTO: quedó una llave o una dirección externa de Kash." >&2
  grep -n -E "eyJ[A-Za-z0-9_-]{20,}\.|Basic [A-Za-z0-9+/=]{12,}|hmsyrnxbgaaqwnorpkxj|kashagency\.me" "$SALIDA"/*.sql | head >&2
  exit 1
fi
echo "Casa «$CASA_ID» ($REF): $n migraciones para ponerla al día en $SALIDA"
cat "$REPORTE"
