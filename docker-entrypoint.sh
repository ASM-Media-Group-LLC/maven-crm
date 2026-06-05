#!/bin/sh
# Container startup: replace __RUNTIME_*__ placeholders in the built bundle
# with the real env-var values from the running container. Lets the same
# Docker image serve any environment (staging branch, prod) just by
# changing env vars — no rebuild required.
#
# This sidesteps the limitation that some PaaS (e.g. Dokploy) don't pass
# Environment values as `docker build --build-arg`, so Vite's loadEnv at
# build-time can't see them.
set -eu

ASSET_DIR="/usr/share/nginx/html"

substitute() {
  placeholder="$1"
  value="$2"
  if [ -z "${value:-}" ]; then return 0; fi
  # Escape characters that have special meaning in sed's replacement string.
  escaped=$(printf '%s' "$value" | sed 's/[\\&|]/\\&/g')
  find "$ASSET_DIR" -type f \( -name '*.js' -o -name '*.html' -o -name '*.json' -o -name '*.webmanifest' \) \
    -exec sed -i "s|${placeholder}|${escaped}|g" {} +
}

substitute "__RUNTIME_VITE_SUPABASE_URL__"            "${VITE_SUPABASE_URL:-}"
substitute "__RUNTIME_VITE_SUPABASE_PUBLISHABLE_KEY__" "${VITE_SUPABASE_PUBLISHABLE_KEY:-}"
substitute "__RUNTIME_VITE_SUPABASE_PROJECT_ID__"     "${VITE_SUPABASE_PROJECT_ID:-}"
substitute "__RUNTIME_VITE_PUBLIC_URL__"              "${VITE_PUBLIC_URL:-}"
substitute "__RUNTIME_VITE_GIPHY_API_KEY__"           "${VITE_GIPHY_API_KEY:-}"

echo "[entrypoint] Runtime env applied: VITE_SUPABASE_URL=${VITE_SUPABASE_URL:-(unset)} VITE_PUBLIC_URL=${VITE_PUBLIC_URL:-(unset)}"

exec "$@"
