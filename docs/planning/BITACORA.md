# BITÁCORA — Inbox WhatsApp en Maven

**Proyecto:** bandeja de WhatsApp propia dentro de Maven ("nuestro propio Whaticket"). v1 = módulo **closers**.
**Plan completo:** memoria `whatsapp_inbox_plan.md`.
**Modo de trabajo:** Un solo agente.
**Workflow:** ramas + PR contra `origin/main`; deploys y migraciones a prod requieren OK explícito del usuario en el chat.

## Hoja de ruta (slices — cada uno deployable)
- [✅] **Slice 0** — Scaffolding (rama, BITÁCORA, feature flag documentado)
- [✅] **Slice 1** — Modelo de datos (3 tablas + RLS + masking + realtime + tipos TS) · aplicado y verificado en prod 2026-06-01
- [✅] Slice 2 — Ingesta 1:1 (DMs entrantes → conversación/mensaje) · deployado + VERIFICADO en prod 2026-06-01 (DM "Hola" capturado: contacto + conversación + mensaje direction=in; @lid → phone null, correcto)
- [✅] Slice 4 — Bandeja lectura (lista + hilo, número oculto, realtime) · VERIFICADO en vivo (el owner vio la bandeja con la conversación "Hola")
- [⏳] Slice 3 — Envío saliente (cuadro de escribir + enviar por Evolution, persistido) · implementado (función wa-inbox-send admin-only + compose en InboxPage), falta deploy+merge
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
🏃 SLICE ACTUAL: Slice 3 — envío saliente (escribir + enviar desde la bandeja). Implementado, falta deploy+merge.
✅ HECHO: Slice 0 + Slice 1 (wa_inbox_core en prod) + Slice 2 (ingesta VERIFICADA) + Slice 4 (bandeja VERIFICADA en vivo por el owner)
⏳ EN PROGRESO: Slice 3 — función wa-inbox-send (manda por Evolution + persiste el saliente direction=out, gateada por admin) + cuadro de escribir/enviar en InboxPage. Falta: deploy wa-inbox-send (verify_jwt on) + merge del front. Verificar: responder en la bandeja → llega al WhatsApp + aparece como burbuja saliente.
📋 PRÓXIMO: Slice 5 — asignar conversaciones a closers + abrir a roles (sacar el admin-only) + nav. Luego Slice 7 (números por closer / cutover).
🚧 BLOCKERS: ninguno
📊 PROGRESO: 3 de 8 slices cerrados (0,1,2,4)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Nota de reorden: la bandeja (4) va ANTES del envío (3) — primero ver, después escribir.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
