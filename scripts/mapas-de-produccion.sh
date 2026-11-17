#!/bin/sh
# Rearma el build de PRODUCCIÓN con sus mapas de fuente, para saber qué código es
# «vendor-radix.js:B» o «index.js:m» en llamada_salud.datos.trabas (lo que congela
# la página). La imagen de Dokploy no trae los .map (el Dockerfile los borra);
# este build usa los MISMOS marcadores que el Dockerfile, así que los archivos y
# los nombres minificados salen iguales a los de producción del mismo commit.
#
# Uso (desde la raíz del repo, en el commit que está en producción):
#   sh scripts/mapas-de-produccion.sh            # deja el build en /tmp/maven-mapas
#   sh scripts/mapas-de-produccion.sh otra/ruta
# Después: buscar la función en el .js y leer su origen en el .js.map (por ejemplo
# con `npx source-map-cli resolve <archivo>.js.map <línea> <columna>`).
set -eu

SALIDA="${1:-/tmp/maven-mapas}"

# Las variables del entorno le ganan a los .env del repo (Vite no las pisa).
export VITE_SUPABASE_URL=__RUNTIME_VITE_SUPABASE_URL__
export VITE_SUPABASE_PUBLISHABLE_KEY=__RUNTIME_VITE_SUPABASE_PUBLISHABLE_KEY__
export VITE_SUPABASE_PROJECT_ID=__RUNTIME_VITE_SUPABASE_PROJECT_ID__
export VITE_PUBLIC_URL=__RUNTIME_VITE_PUBLIC_URL__
export VITE_GIPHY_API_KEY=__RUNTIME_VITE_GIPHY_API_KEY__
export VITE_DOCS_SYNC_URL=__RUNTIME_VITE_DOCS_SYNC_URL__

npx vite build --outDir "$SALIDA" --emptyOutDir
echo "Mapas de fuente en $SALIDA/assets/*.js.map"
