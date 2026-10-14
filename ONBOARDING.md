# Bienvenido a Maven

Esta guía deja tu Mac listo para trabajar en Maven con Claude Code, igual que el resto del equipo.

## 1. Accesos que te tiene que dar Jhon

- **GitHub:** colaborador en `ASM-Media-Group-LLC/maven-crm` con tu usuario de GitHub.
- **Tailscale:** tu Mac aprobado en la red del equipo (para llegar al mini5, que guarda el Drive y el NAS).
- **Supabase (opcional):** acceso al proyecto si tu Claude va a usar el MCP de Supabase para consultar la base. Sin esto puedes trabajar igual en el código.

## 2. Instalar todo con un comando

En la Terminal de tu Mac:

```bash
curl -fsSL https://raw.githubusercontent.com/ASM-Media-Group-LLC/maven-crm/main/infra/scripts/preparar-mac-dev.sh -o /tmp/preparar-mac-dev.sh && bash /tmp/preparar-mac-dev.sh
```

El script instala Homebrew, git, Node, la CLI de GitHub y Claude Code si faltan; te pide entrar a GitHub (`gh auth login`, con tu usuario); clona el repo en `~/Projects/maven-crm`; instala las dependencias y comprueba que compile. Es seguro volver a correrlo.

Como el repo es privado, el `curl` de arriba solo funciona si ya estás dentro de GitHub en el navegador; si no, pídele el archivo a Jhon y córrelo con `bash preparar-mac-dev.sh`.

## 3. Entrar a Claude Code

```bash
cd ~/Projects/maven-crm && claude
```

La primera vez te pide iniciar sesión con tu cuenta de Anthropic. Claude lee solo el `CLAUDE.md` del repo, que resume cómo trabajamos: idioma, ramas, verificación y cuidados con producción. Léelo tú también, son dos minutos.

## 4. Primer día

- `git fetch origin` y crea tu primera rama desde `origin/main` en un worktree, como dice `CLAUDE.md`.
- Corre `npx vitest run src/test/messenger` para ver la suite en marcha.
- Abre un PR pequeño para probar el flujo completo: rama, verificación, PR, merge por squash, deploy automático.

## 5. Dónde está cada cosa

- `frontend/src/pages/` las pantallas por módulo; `frontend/src/hooks/` la lógica (Messenger vive en `useChat.ts`); `frontend/src/lib/i18n.ts` los textos.
- `supabase/functions/` las edge functions (`admin-user-actions`, `drive`, `web-push`…); `supabase/migrations/` el historial de la base.
- `infra/nas-drive/` el servidor de archivos del mini5; `infra/scripts/` utilidades como esta.

Cualquier duda, en el Messenger de Maven: grupo del equipo o directo a Jhon.
