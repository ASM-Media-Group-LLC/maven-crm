# Maven — Multi-agente + Orquestador (Clari)

> **Norte:** el dueño le habla a **un orquestador (Clari)** —en Maven y en WhatsApp— que conoce todo el CRM
> y responde de cualquier dominio. Cada equipo tiene su **bot especializado** (managers, closers/Kash,
> vendedores de plataforma), todos sobre **una misma capa de tools del CRM compartida**.
>
> **Principio rector:** no son N bots con N prompts. Es **1 catálogo de tools** + cada agente =
> *persona (prompt) + subset de tools del catálogo + audiencia*. El orquestador = acceso a TODO + routing.

## Estado actual (lo que hay hoy)
- **WhatsApp:** UN agente conversacional (`whatsapp-agent`) con 25 tools inline, mismo cerebro para todos los
  grupos. Multi-tenant, multi-línea (gateway Baileys). Sin orquestador, sin perfiles por grupo. + ticks
  proactivos (`whatsapp-supervisor-tick` closers/LLG, `promolog-manager-tick`).
- **En Maven:** 3 asistentes IA aislados, contexto inyectado (sin tools): **Clari** (ayuda de la app),
  **Sales Coach** (ventas), **Mike** (QA).

## Decisiones (Fase 0 — cerradas con el dueño)
1. **Orquestador = Clari**, en **dos superficies**: chat web en Maven + **bot privado del dueño en WhatsApp**.
2. **Agentes iniciales:** managers · closers/Kash · vendedores de plataforma. **Extensible** (sumar agente = config, no código).
3. **Permisos:** orquestador = owner/admin (ve TODO); cada bot acotado a su dominio + tenant.
4. **Modelos:** orquestador y respuestas que razonan → Sonnet; modo "siempre escuchando"/auto → Haiku.
   **Override por perfil** (afinar costo sin tocar código).

## Fases
- **Fase 1 — Catálogo de tools compartido** (`_shared/agent-tools`): contrato `AgentTool` (name, schema,
  domain, scope read/write, handler) + registry + módulos por dominio. Empezar por Promolog (read);
  ir migrando las 25 del whatsapp-agent **sin romper** el bot de closers (incremental + verificado).
- **Fase 2 — Perfiles de bot por grupo:** `bot_profile` en `whatsapp_groups` → {persona, subset de tools,
  modelo}. Habilita managers / closers / vendedores con UN codebase. (Acá prende el bot de managers conversacional.)
- **Fase 3 — Orquestador (Clari) cross-dominio:** edge `ai-orchestrator` (o Clari evolucionada) con
  function-calling sobre TODO el catálogo + routing + síntesis. Dos puertas: Maven + WhatsApp privado.
  Absorbe Sales Coach y Mike como dominios.
- **Fase 4 — Avanzado (futuro):** handoff/delegación entre agentes, memoria compartida, proactividad cross-dominio.

## Transversal
Observabilidad (logs + costo por agente), permisos/RLS, presupuesto de costo, evals de routing
(que no alucine ni cruce datos de tenant).

## Bitácora
- 2026-06-15 — Fase 0 cerrada (decisiones arriba). Arranca Fase 1: catálogo `_shared/agent-tools` +
  dominio Promolog, dogfoodeado en `promolog-manager-tick`.
