# Estado del Proyecto — Maven CRM (v3)

> Última actualización: 2026-05-04 · Mantenedor: Jhon · Repo: `jhonjlopez-sudo/maven-crm`
>
> Este archivo se actualiza al cierre de cada slice grande. Sirve como
> punto de entrada para cualquier humano o agente nuevo: en una página
> queda claro dónde estamos, qué se decidió, y qué falta.

## Stack y deploy

| Pieza | Decisión actual |
|---|---|
| Frontend | Vite + React 18 + Tailwind 3 + shadcn/ui |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions Deno) |
| IA | Groq (`api.groq.com/openai/v1`) — migrado: Lovable AI Gateway → MiniMax → Groq |
| Video | LiveKit (`LIVEKIT_URL` env, self-hosted o cloud) |
| Email | Resend (sólo para invitaciones de calls hoy) |
| Deploy | Dokploy → `jhonjlopez-sudo/maven-crm`, branch `main` |
| Build | `npm run build` → `dist/` (Dockerfile multistage con nginx) |

## Layout del repo (post-split)

```
frontend/         ← UI (Vite + React)
  index.html
  src/
  public/
supabase/         ← backend (Edge Functions + migrations)
  config.toml
  functions/      ← deno edge functions
  migrations/     ← SQL migrations (auto-aplican vía GitHub Integration)
servicios/        ← reservado para microservicios futuros (vacío)
dist/             ← build output, lo sirve Dokploy
.claude/          ← config local (launch.json para preview)
+ configs en root (vite, tsconfig, tailwind, etc.)
+ Dockerfile + nginx.conf en root
```

> Nota: el directorio `backend/` que existió brevemente se removió porque
> la GitHub Integration de Supabase escanea `supabase/` en la raíz por
> convención. El intento previo con un symlink `supabase` → `backend/supabase`
> no fue seguido por la Integration (escanea via GitHub API, ve el modo
> 120000 de symlink y lo ignora). El "split en 3 dominios" sigue siendo
> visible: `frontend/`, `supabase/` (backend), `servicios/`.

## Áreas funcionales

### ✅ Completadas (UI funcional)

- **Cowork** — visible en sidebar (MENÚ), permission-gated. Backend (LiveKit) ya wired.
- **Settings** — vertical tab rail con Mi cuenta / Proyecto MP / Administración / Recursos.
- **Permisos por rol** — modal con módulos agrupados, copiar de otro rol, herencia padre↔hijo.
- **Migración de IA** — `ai-sales-chat` y `supercontact-ai` corren contra **Groq** con env vars `GROQ_API_KEY`, `GROQ_BASE_URL` (default `api.groq.com/openai/v1/chat/completions`), `GROQ_MODEL` (default `llama-3.3-70b-versatile`), `GROQ_VISION_MODEL` (default `meta-llama/llama-4-scout-17b-16e-instruct`, sólo para `analyze_image` de SuperContacts).

### 🟡 En migración desde `kash-call-qa`

#### Scouter Assist (`/scouter-assist`)

| Subtab | Estado | Notas |
|---|---|---|
| Home | ✅ | Grid de cards con foto IG, stats, drawer editable, favoritos toggle |
| Favoritas | ✅ | Reusa Home con `favoritesOnly` |
| Leads | ✅ | Tabla densa + drawer compartido |
| Funnel | ✅ | 4 etapas, conversiones, top fuentes, por-compañía |

**Falta para Scouter:** worker backend (Apify discovery + AI scoring de leads). Esa pieza vive en `servicios/scouter-worker/` cuando se haga.

#### Agency QA (`/agency-qa`)

| Subtab | Estado | Notas |
|---|---|---|
| Calls | ✅ | Tabla densa + drawer detalle (radar dimensiones, red flags, key moments, improvements, model signals, transcript collapsible) |
| Nueva QA | ✅ create / 🟡 enrich | Form crea row con `claude_analysis: {}`. Falta dispatch IA (edge function `qa-analyze` + `GROQ_API_KEY`). |
| QA Chat | 🟡 placeholder | Mike chat (chat con sesión scoped a closer/all) |
| Modelos | ✅ | Catálogo con stats agregados (count calls / avg score / last outcome); click row → CallDetailDrawer reusado |
| Analytics | 🟡 placeholder | Dashboard agregado |

## Schema de base de datos

### Tablas migradas desde kash-call-qa

**Agency QA (prefijo `qa_`)**
- `qa_closers`, `qa_models`, `qa_calls`, `qa_human_feedback`, `qa_section_feedback`, `qa_chat_sessions`, `qa_chat_messages`

**Scouter Assist (prefijo `scouter_`)**
- `scouter_companies`, `scouter_leads`, `scouter_lead_favorites`, `scouter_jobs`, `scouter_apify_token_state`, `scouter_apify_budget`, `scouter_notifications`, `scouter_notification_reads`

Ambos sets ya tienen migrations subidas (`20260504100000`, `20260504110000`) pero RLS hoy es **permisivo** (cualquier authenticated user lee/escribe). Multi-tenant pendiente — ver "Decisiones abiertas".

## Decisiones tomadas

| Fecha | Decisión | Contexto |
|---|---|---|
| 2026-05-02 | Branch JHON-V3 → main del nuevo repo | Migración `ASM-TECH-MIAMI/maven-s-simple-page` → `jhonjlopez-sudo/maven-crm` |
| 2026-05-04 | Repo dividido en `frontend/` `backend/` `servicios/` | Preparar para microservicios futuros sin romper Dokploy |
| 2026-05-04 | Lovable AI Gateway → MiniMax | Eliminar dependencia de Lovable en runtime |
| 2026-05-04 | MiniMax → Groq | Cambio de proveedor; Groq tiene mejor latencia para llama-3.3-70b + tier free razonable |
| 2026-05-04 | Drawer (no página dedicada) para detalles | Convención cross-area; aplicado en Scouter Lead + Call detail |
| 2026-05-04 | Radar de `dimensions` con recharts | Coherente con resto de Maven |
| 2026-05-04 | Multi-tenant por **row-level** en tablas nuevas | Maven se venderá a clientes externos (Phase 2) |
| 2026-05-04 | `tenants` + `tenant_members` creadas; `qa_*`/`scouter_*` aisladas por `tenant_id` con RLS scoping | Implementación de la decisión anterior — primer tenant: ASM Tech |
| 2026-05-04 | ~~Symlink `supabase/` → `backend/supabase/`~~ → moved real directory back to `supabase/` at root | La GitHub Integration NO sigue symlinks (los ve como mode 120000 y los ignora). Movido el directorio real a la raíz, eliminado `backend/` ya vacío. |
| 2026-05-04 | Supabase GitHub Integration conectada al repo | Migrations auto-aplican a la branch JHON-V3 al push; promoción manual JHON-V3 → main |

## Deudas conocidas

| # | Deuda | Costo si no se atiende |
|---|---|---|
| 1 | ~~RLS de `qa_*` y `scouter_*` permisiva — falta multi-tenant~~ ✅ resuelto en migration `20260504200000`/`210000`/`220000` | — |
| 2 | Tipos Supabase no regenerados — uso `as unknown` casts | Errores runtime que TS no atrapa al cambiar el schema |
| 3 | `claude_analysis` jsonb sin parsing zod | Cambio de shape en edge function rompe el drawer en runtime, no en build |
| 4 | Patrón "tabla densa + drawer detalle" repetido — sin componente compartido | Cada nueva vista duplica ~150 LOC de boilerplate |
| 5 | Transcript renderizado eager + sin virtualizar | QAs >50k chars degradan el drawer |
| 6 | `extra_fields` JSONB libre en `chatter_profiles` y otras tablas | Falta type contract centralizado (parcial en `profileExtras.ts`) |
| 7 | Algunos archivos gigantes (Dashboard2 1858 LOC, Promolog 1894, useLiveKit 1688) | Difícil de mantener, propenso a bugs |
| 8 | Cobertura de tests baja (~25 archivos para 700+ source files) | Bug fix sin red de seguridad |
| 9 | Summit Forge no integrado (charter v1.1 lo declara obligatorio) | Documentación dispersa, no auto-generada |

## Decisiones abiertas (necesitan input)

- **Multi-tenant de tablas existentes de Maven** (creators, sales, leads viejas, etc.) — fuera de scope de la migración kash, pero hay que decidir cuándo se aborda.
- **Worker de Scouter** — cuándo lo abordamos. Es la pieza más grande pendiente.
- **Re-analyze de calls** — necesita edge function que llame a MiniMax (o proveedor IA propio) con el prompt de kash adaptado.

## Próxima slice candidata

- **UI de admin de tenants + invite flow** — para que cuando entre el primer cliente externo no se gestione por SQL directo. Pequeño.
- **Active tenant switcher** — solo necesario cuando un usuario pertenezca a múltiples tenants. Hoy todos están solo en ASM Tech, así que no apura.
- **Analytics / Nueva QA / QA Chat** — completar Agency QA UI (Modelos ya está ✅).
- **Worker de Scouter** (Apify + AI scoring) — pieza grande backend, va en `servicios/scouter-worker/`.

## Cómo retomar este proyecto desde cero

1. Clonar `jhonjlopez-sudo/maven-crm` (rama `main`).
2. `npm install`.
3. `.env` → setear `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_PUBLIC_URL`. Mismas vars en Dokploy.
4. Edge function secrets en Supabase: `MINIMAX_API_KEY`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
5. `npm run dev` (puerto 8080 por defecto, respeta `PORT` env).
6. Para deploy: push a `main` → Dokploy redeploys.
