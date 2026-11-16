#!/usr/bin/env bash
# Sanea el molde recién sacado de Kash (tren de agencias, vagón 1 — 16/11/2026).
#
#   infra/casas/sanear-molde.sh <esquema.sql>
#
# Kash tiene conexiones propias hacia un sistema externo (otro proyecto de
# Supabase que recibe creadoras, ganancias y promolog), con su contraseña escrita
# dentro. Nada de eso debe viajar a una casa nueva ni quedar en el repo:
#   · se quitan los disparadores de «Database Webhooks» (supabase_functions);
#   · la dirección de ese sistema externo se cambia por una que no existe
#     (.invalid), así cualquier llamada que quede falla sin salir de la casa;
#   · toda credencial «Basic …» se reemplaza por un marcador.
# Termina con error si después de sanear queda alguna credencial o dirección externa.
set -euo pipefail
F="${1:?falta el archivo del esquema}"
EXTERNO="hmsyrnxbgaaqwnorpkxj"

grep -v '"supabase_functions"\."http_request"' "$F" \
  | sed -E -e "s#https://${EXTERNO}\.supabase\.co#https://sincronizacion-externa-de-kash.invalid#g" \
           -e 's#Basic [A-Za-z0-9+/=]{12,}#Basic SIN-CREDENCIAL#g' \
  > "$F.saneado"
mv "$F.saneado" "$F"

if grep -q -E "Basic [A-Za-z0-9+/=]{12,}|${EXTERNO}|\"supabase_functions\"\.\"http_request\"" "$F"; then
  echo "ALTO: el molde todavía trae credenciales o conexiones externas de Kash." >&2
  exit 1
fi
echo "Molde saneado: $(wc -c < "$F") bytes, sin credenciales ni conexiones externas."
