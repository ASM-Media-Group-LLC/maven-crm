#!/usr/bin/env bash
# Prepara el molde para UNA casa (tren de agencias, vagón 1 — 15/11/2026).
#
#   infra/casas/preparar.sh <id-de-la-casa> <carpeta-de-salida>
#
# Toma infra/casas/molde/{esquema,extras}.sql (la estructura de Kash SIN datos) y
# deja en <salida>/ las migraciones de esa casa, con lo propio de Kash cambiado:
#   · la dirección de la base de Kash → la de esta casa (si no, sus funciones
#     le hablarían a Kash);
#   · el código de la agencia Kash → el de esta agencia;
#   · sin el esquema ni las tablas de respaldo de Kash;
#   · la fila de esta agencia en `tenants`.
# Se niega a preparar nada para la base de Kash.
set -euo pipefail

CASA_ID="${1:?falta el id de la casa (ver infra/casas/casas.json)}"
SALIDA="${2:?falta la carpeta de salida}"
RAIZ="$(cd "$(dirname "$0")" && pwd)"
CASAS="$RAIZ/casas.json"

KASH_REF="lsagslbkliprespbyhts"
KASH_TENANT="30869615-f579-4981-8a1f-dbebc61eae2d"

leer() { jq -r --arg id "$CASA_ID" ".casas[] | select(.id == \$id) | .$1" "$CASAS"; }
REF="$(leer ref)"
TENANT="$(leer tenant_id)"
NOMBRE="$(leer nombre)"
SLUG="$(leer slug)"

if [ -z "$REF" ] || [ "$REF" = "null" ]; then echo "La casa «$CASA_ID» no está en casas.json" >&2; exit 1; fi
if [ "$REF" = "$KASH_REF" ] || [ "$REF" = "$(jq -r .kash_no_tocar "$CASAS")" ]; then
  echo "ALTO: esa es la base de Kash. Kash no se toca." >&2; exit 1
fi
if [ "$TENANT" = "$KASH_TENANT" ]; then echo "ALTO: la casa no puede usar el código de la agencia Kash." >&2; exit 1; fi

mkdir -p "$SALIDA"
# 1) La estructura, con la dirección y el código de agencia de esta casa.
sed -e "s/${KASH_REF}/${REF}/g" -e "s/${KASH_TENANT}/${TENANT}/g" \
  "$RAIZ/molde/esquema.sql" > "$SALIDA/20261116000000_molde.sql"

# 2) Baldes, disparadores de cuentas, permisos de archivos y tablas en vivo.
cp "$RAIZ/molde/extras.sql" "$SALIDA/20261116000001_extras.sql"

# 3) Sin respaldos de Kash + la agencia de esta casa.
{
  echo "-- Limpieza y alta de la agencia de esta casa (generado por preparar.sh)."
  echo "drop schema if exists backup_pre_refactor cascade;"
  grep -o 'CREATE TABLE IF NOT EXISTS "public"\."[a-z0-9_]*\(respaldo\|backup\)[a-z0-9_]*"' "$RAIZ/molde/esquema.sql" \
    | sed -E 's/.*"public"\."([^"]+)"/drop table if exists public.\1 cascade;/' | sort -u
  printf "insert into public.tenants (id, slug, name, active) values ('%s', '%s', '%s', true) on conflict (id) do nothing;\n" \
    "$TENANT" "$SLUG" "$(printf '%s' "$NOMBRE" | sed "s/'/''/g")"
} > "$SALIDA/20261116000002_casa.sql"

# Comprobación: no puede quedar nada que apunte a Kash ni a su sistema externo,
# ni ninguna contraseña escrita (ver sanear-molde.sh).
if grep -q -E "Basic [A-Za-z0-9+/=]{12,}|hmsyrnxbgaaqwnorpkxj|\"supabase_functions\"\.\"http_request\"" "$SALIDA"/*.sql; then
  echo "ALTO: el molde trae credenciales o conexiones externas de Kash: corre sanear-molde.sh." >&2
  exit 1
fi
if grep -q -e "$KASH_REF" -e "$KASH_TENANT" "$SALIDA"/*.sql; then
  echo "ALTO: quedó algo apuntando a Kash en la casa «$CASA_ID»." >&2
  grep -n -e "$KASH_REF" -e "$KASH_TENANT" "$SALIDA"/*.sql | head >&2
  exit 1
fi
echo "Casa «$CASA_ID» ($REF) lista en $SALIDA"
