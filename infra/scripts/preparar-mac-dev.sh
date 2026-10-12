#!/bin/bash
# Deja un Mac listo para trabajar en Maven con Claude Code. Idempotente:
# instala solo lo que falta y no pisa nada que ya exista.
set -euo pipefail

DESTINO="${MAVEN_DIR:-$HOME/Projects/maven-crm}"
REPO="jhonjlopez-sudo/maven-crm"

paso() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }

paso "Homebrew"
if ! command -v brew >/dev/null 2>&1; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
# Apple Silicon o Intel: dejar brew en el PATH de esta sesión.
eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv)"
ok "brew $(brew --version | head -1 | awk '{print $2}')"

paso "Herramientas: git, node, gh"
for f in git node gh; do
  if ! brew list --formula "$f" >/dev/null 2>&1 && ! command -v "$f" >/dev/null 2>&1; then
    brew install "$f"
  fi
done
ok "git $(git --version | awk '{print $3}') · node $(node --version) · gh $(gh --version | head -1 | awk '{print $3}')"

paso "Claude Code"
if ! command -v claude >/dev/null 2>&1; then
  npm install -g @anthropic-ai/claude-code
fi
ok "claude $(claude --version 2>/dev/null | head -1)"

paso "Entrar a GitHub con tu usuario"
if ! gh auth status -h github.com >/dev/null 2>&1; then
  gh auth login -h github.com -p https -w
fi
ok "GitHub: $(gh api user --jq .login)"
gh auth setup-git >/dev/null 2>&1 || true

paso "Repositorio en $DESTINO"
if [ -d "$DESTINO/.git" ]; then
  git -C "$DESTINO" fetch -q origin && ok "ya estaba; traído lo último de origin"
else
  mkdir -p "$(dirname "$DESTINO")"
  gh repo clone "$REPO" "$DESTINO"
  ok "clonado"
fi

paso "Dependencias"
cd "$DESTINO"
npm ci --no-audit --no-fund
ok "$(ls node_modules | wc -l | tr -d ' ') paquetes"

paso "Comprobación: compila"
npm run build >/tmp/maven-build.log 2>&1 && ok "build correcto" || { echo "  ✗ el build falló, mira /tmp/maven-build.log"; exit 1; }

printf '\n\033[1;32mListo.\033[0m Para empezar:\n  cd %s && claude\n(la primera vez, Claude te pide iniciar sesión con tu cuenta de Anthropic)\n' "$DESTINO"
