# BITÁCORA — Inbox WhatsApp en Maven

**Proyecto:** bandeja de WhatsApp propia dentro de Maven ("nuestro propio Whaticket"). v1 = módulo **closers**.
**Plan completo:** memoria `whatsapp_inbox_plan.md`.
**Modo de trabajo:** Un solo agente.
**Workflow:** ramas + PR contra `origin/main`; deploys y migraciones a prod requieren OK explícito del usuario en el chat.

## Hoja de ruta (slices — cada uno deployable)
- [✅] **Slice 0** — Scaffolding (rama, BITÁCORA, feature flag documentado)
- [✅] **Slice 1** — Modelo de datos (3 tablas + RLS + masking + realtime + tipos TS) · aplicado y verificado en prod 2026-06-01
- [⏳] Slice 2 — Ingesta 1:1 (DMs entrantes → conversación/mensaje, reusa parser Evolution) · implementado, falta deploy+verify
- [ ] Slice 3 — Envío saliente (Maven → Evolution, persistido + idempotente)
- [ ] Slice 4 — Bandeja lectura (lista + hilo, número oculto, realtime)
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
🏃 SLICE ACTUAL: Slice 2 — ingesta de DMs 1:1 (implementado, falta deploy+verify)
✅ HECHO: Slice 0 (scaffolding) + Slice 1 (wa_inbox_core APLICADA/VERIFICADA en prod)
⏳ EN PROGRESO: Slice 2 — persistInboxMessage() en whatsapp-ingest: DM 1:1 entrante → wa_contacts/wa_conversations/wa_conversation_messages (additive, best-effort, idempotente). Falta: deploy whatsapp-ingest + verificar con un DM real.
📋 PRÓXIMO: Slice 3 — envío saliente (Maven → Evolution, persistido)
🚧 BLOCKERS: ninguno
📊 PROGRESO: 1 de 8 slices cerrados
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
