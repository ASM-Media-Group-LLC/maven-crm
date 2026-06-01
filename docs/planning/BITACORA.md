# BITÁCORA — Inbox WhatsApp en Maven

**Proyecto:** bandeja de WhatsApp propia dentro de Maven ("nuestro propio Whaticket"). v1 = módulo **closers**.
**Plan completo:** memoria `whatsapp_inbox_plan.md`.
**Modo de trabajo:** Un solo agente.
**Workflow:** ramas + PR contra `origin/main`; deploys y migraciones a prod requieren OK explícito del usuario en el chat.

## Hoja de ruta (slices — cada uno deployable)
- [✅] **Slice 0** — Scaffolding (rama, BITÁCORA, feature flag documentado)
- [✅] **Slice 1** — Modelo de datos (3 tablas + RLS + masking + realtime + tipos TS) · aplicado y verificado en prod 2026-06-01
- [✅] Slice 2 — Ingesta 1:1 (DMs entrantes → conversación/mensaje) · deployado + VERIFICADO en prod 2026-06-01 (DM "Hola" capturado: contacto + conversación + mensaje direction=in; @lid → phone null, correcto)
- [⏳] Slice 4 — Bandeja lectura (lista + hilo, número oculto, realtime) · REORDENADO: va ANTES del envío (no tiene sentido mandar sin pantalla). Implementado, falta merge + verla andando.
- [ ] Slice 3 — Envío saliente (Maven → Evolution, persistido) · va DESPUÉS de la bandeja (cuadro de escribir + enviar)
- [ ] Slice 5 — Componer + asignar (escribir desde UI, asignar chat, marcar leído)
- [ ] Slice 6 — Copiloto IA (Claude directo; visión de imágenes vía Gemini/OpenRouter existente)
- [ ] Slice 7 — Números por closer + cutover desde Whaticket

## Decisiones de arquitectura
- **Núcleo de conversación GENÉRICO** (`department`) para que managers/reclutamiento enchufen después sin reescribir.
- **Escritura solo vía edge functions** (service_role) → mantiene Evolution en sync + idempotencia. El front nunca inserta mensajes/conversaciones directo.
- **Masking server-side real:** `wa_contacts.phone_e164` revocado a `authenticated`/`anon` a nivel columna; el front usa la vista `v_wa_contacts` (enmascarado salvo admin/service_role). Reusa `is_phone_privileged()` / `mask_phone()`.
- **Copiloto = Claude vía Anthropic directo** (prompt caching + tool use + menos terceros tocando PII). **Visión de imágenes = Gemini vía OpenRouter** (función `whatsapp-analyze-image` ya existente).
- **Feature flag:** la bandeja (Slice 4+) se monta detrás de rol + flag → deploy oscuro hasta validar.

## Estado
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 FASE: Implementación incremental
🏃 SLICE ACTUAL: Slice 4 — bandeja visual (lectura). Implementado, falta merge + verla andando.
✅ HECHO: Slice 0 (scaffolding) + Slice 1 (wa_inbox_core en prod) + Slice 2 (ingesta de DMs VERIFICADA en prod con un DM real)
⏳ EN PROGRESO: Slice 4 — InboxPage (frontend/src/pages/inbox/InboxPage.tsx): lista de conversaciones + hilo estilo WhatsApp, número oculto, realtime. Ruta /inbox gateada por AdminRoute (lanzamiento oscuro). Falta: merge (Dokploy) + verla con la conversación "Hola".
📋 PRÓXIMO: Slice 3 — envío saliente (cuadro de escribir + enviar por Evolution, persistido)
🚧 BLOCKERS: ninguno
📊 PROGRESO: 2 de 8 slices cerrados
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Nota de reorden: la bandeja (4) va ANTES del envío (3) — primero ver, después escribir.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
