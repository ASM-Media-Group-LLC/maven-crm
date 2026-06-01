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
- [✅] Slice 3 — Envío saliente (cuadro de escribir + enviar) · deployado + VERIFICADO en vivo (#276/#277). Fix clave: enviar al wa_jid COMPLETO (@lid no rutea por dígitos). UI optimista.
- [⏳] Slice 5 — Canales (números) + asignación + abrir a roles. Base DB del modelo de canales HECHA (wa_channels + wa_channel_members + channel_id en conversaciones + visibilidad por canal). Falta: ingest→channel_id, pantalla de canales (mapeo + QR), asignación, abrir inbox a roles + link en menú.
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
🏃 SLICE ACTUAL: Slice 5 — modelo de CANALES (números). Base DB lista en este PR; falta deploy+merge + sub-slices.
✅ HECHO: Slices 0,1,2,4,3 — NÚCLEO (ver + responder) VERIFICADO EN VIVO por el owner. El inbox ya es un Whaticket usable básico.
⏳ EN PROGRESO: Slice 5 — 5a (modelo de canales) APLICADO en prod · 5b (ingest resuelve channel_id por instancia + pantalla /inbox/canales: crear canal + mapear miembros, con link desde la bandeja) implementado. Falta: (c) asignación de conversaciones a una persona; (d) abrir el inbox a roles (sacar admin-only) + link en el menú lateral; conectar números por QR (operativo, depende del setup Evolution/Whaticket).
📋 PRÓXIMO (dentro de Slice 5): (c) asignación + (d) abrir a roles. Antes, el owner define su setup de números para empezar a mapear.
🚧 BLOCKERS: ninguno — pero la pantalla de "conectar número (QR)" depende de la API de instancias de Evolution / setup actual (Whaticket vs nuevos).
📊 PROGRESO: 4 de 8 cerrados (0,1,2,3,4) + Slice 5 en curso
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Nota de reorden: la bandeja (4) va ANTES del envío (3) — primero ver, después escribir.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
