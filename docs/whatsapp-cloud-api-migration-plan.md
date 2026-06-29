# Plan: migrar el outreach en frío a WhatsApp Business Cloud API (oficial)

> Fecha: 2026-06-27. Contexto: la línea +57 (Kash) fue **restringida** por WhatsApp.
> Causa raíz (investigación verificada): outreach en frío con cliente NO oficial (Baileys)
> + 37% de envíos a números inexistentes. Baileys proactivo tiene ~15-30%/año de ban;
> reactivo <2%. **El único camino de riesgo ~0 para el outreach en frío es la API oficial.**

## TL;DR — la arquitectura objetivo

| Tráfico | Transporte | Por qué |
|---|---|---|
| **Primer contacto en frío** (closers → lead que nunca escribió) | **Cloud API** (templates aprobados) | Sancionado por Meta, sin riesgo de ban, opt-in. |
| **Conversación reactiva** (el lead respondió, ventana 24h abierta) | Cloud API freeform **o** bandeja Baileys | Dentro de 24h es freeform y gratis. |
| **Bandeja interna / líneas ya operando / grupos** | **Baileys gateway** (lo que ya tenés, endurecido PR #692) | Reactivo = bajo riesgo. No tocar lo que funciona. |

Regla de oro: **iniciar SIEMPRE por Cloud API; responder puede seguir por donde ya está.**

## La verdad incómoda sobre Cloud API (leer antes de invertir)

Cloud API **no es "blastear más libre"** — es "mensajear cumpliendo":
- Fuera de la ventana de 24h **solo se pueden mandar templates pre-aprobados** por Meta (categorías Marketing / Utility / Authentication). Freeform solo dentro de las 24h tras un mensaje del usuario.
- **Opt-in obligatorio**: tenés que poder demostrar que el destinatario aceptó recibir mensajes (en algún canal). El "cold blast" a una lista comprada/scrapeada **viola las políticas** y degrada el *quality rating* → restricciones del WABA.
- **Caso ideal para Maven**: creadoras que **mostraron interés** / dejaron datos / vienen de un formulario o de LeadGen con señal de contacto. Para esas, Cloud API es perfecto. Para DMs 100% en frío sin ningún opt-in, ningún canal es "seguro" — Cloud API te frena, Baileys te banea.

## Realidades de plataforma (2025-2026, fuentes Meta)

- **Tiers de mensajería** (conversaciones *business-initiated* únicas por 24h): arranca en **250/día** → 1.000 → 10.000 → 100.000 → ilimitado. Se sube **automáticamente** según volumen + *quality rating* (verde/amarillo/rojo).
- **Límites por portfolio (desde oct-2025)**: el límite es del *portfolio* de negocio, no por número. Un número nuevo **hereda** el límite del portfolio (no hay warm-up de tier individual como antes).
- **Costo por conversación** (no por mensaje), por país y categoría. MX/CO: marketing ≈ centavos por conversación de 24h; *service* (iniciadas por el user) suelen ser gratis. << costo de líneas baneadas + riesgo legal.
- **Bloqueo de marketing a US (desde abr-2025)**: marketing template a números US no se entrega (transaccional sí). **No afecta** tu base MX/CO, pero tenelo en el radar si sumás US.
- **Número dedicado**: el número que conectás al WABA **no puede estar activo en la app normal de WhatsApp** al mismo tiempo. Migrar un número existente desde la app **borra su historial**. Recomendado: **número NUEVO dedicado** al outreach (no canibalizar una línea que ya usan humanos).

## Prerrequisitos (lo que hay que tener antes de tocar código)

1. **Meta Business Manager verificado** (verificación de negocio — puede pedir documentación).
2. **WhatsApp Business Account (WABA)** dentro del Business Manager.
3. **Número dedicado** nuevo (no usado en la app de WhatsApp), para el outreach.
4. **Display name** del remitente aprobado por Meta.
5. **Payment method** cargado (se paga por conversación).
6. Decisión de **proveedor**: directo con Meta (Cloud API gratis de fee, pagás solo conversaciones) **o** vía BSP (Twilio/Infobip/360dialog — más caro pero menos fricción de setup/compliance). Para empezar y controlar costos: **directo con Meta Cloud API**.

## Integración técnica en Maven (encaja con lo que ya existe)

La bandeja ya unifica mensajes en `wa_conversation_messages` y los canales en `wa_channels`.
Cloud API entra como **un tipo de canal más**, no como un sistema paralelo:

- **`wa_channels`**: nuevo `provider: 'cloud_api'` (vs `'baileys'`), con `phone_number_id` + `waba_id`.
- **Envío**: edge function `wa-cloud-send` → `POST https://graph.facebook.com/v21.0/{phone_number_id}/messages` (template para iniciar; freeform dentro de ventana). Token de sistema del WABA en Supabase secrets.
- **Recepción**: webhook de Meta → edge `wa-cloud-webhook` → normaliza `messages` + `statuses` (sent/delivered/read/failed) y los inserta en `wa_conversation_messages` (igual shape que Baileys) → la bandeja los muestra sin cambios de UI.
- **Templates**: tabla `wa_templates` (nombre, idioma, categoría, body con variables, estado de aprobación). UI para crear/editar y ver estado.
- **Opt-in**: columna/registro de consentimiento por contacto (cuándo/dónde optó). Gate del envío de marketing.

## Fases (slices pequeños, cada uno deja algo usable)

- **F0 · Spike (de-riesgo)**: crear WABA + número de prueba (sandbox de Meta), mandar 1 template a un número propio vía Graph API a mano (curl). Validar el flujo end-to-end. *Sin código en Maven.*
- **F1 · Envío de template**: edge `wa-cloud-send` + 1 plantilla de outreach (categoría Marketing) diseñada para pasar aprobación, con variables (nombre, @handle). Registro de opt-in. Probar a un número real con consentimiento.
- **F2 · Webhook → bandeja**: edge `wa-cloud-webhook` que mete respuestas + estados en `wa_conversation_messages`. Ahora la conversación entrante cae en la bandeja como cualquier otra.
- **F3 · Canal en la UI**: `wa_channels` provider=cloud_api configurable en Canales; el closer dispara el primer contacto eligiendo la plantilla desde la bandeja.
- **F4 · Routing**: el primer contacto en frío de closers se rutea SIEMPRE por el canal Cloud API; lo reactivo sigue por Baileys/bandeja. (Acá conectamos también el flag `outreach:true` del gateway para el warm-up, ya que el outreach "de verdad" pasa a Cloud API.)

## Qué NO hacer
- NO migrar a Cloud API un número que ya usan los humanos en la app (borra historial / lo deja inutilizable en la app).
- NO usar Cloud API para mandar a listas sin opt-in (degrada el quality rating → restricción del WABA; mismo problema que Baileys pero con tu cuenta de negocio verificada en juego).
- NO esperar que Cloud API permita "blast en frío ilimitado": exige templates aprobados + consentimiento.

## Decisión pendiente del dueño
- ¿Outreach a **leads con interés/opt-in** (encaja perfecto con Cloud API) o DMs 100% en frío sin consentimiento (no encaja en ningún canal de forma sostenible)?
- ¿Directo con Meta (más barato, más setup) o BSP (más caro, menos fricción)?
- ¿Número nuevo dedicado para el outreach? (recomendado)

Relacionado: investigación completa en la memoria del proyecto (`whatsapp_ban_baileys_research`); endurecimiento de Baileys en PR #692.
